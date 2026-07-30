import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  sql
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DatabaseService } from "../database/database.service";
import {
  notificationBookingParticipants,
  notificationBookings,
  notificationOutbox,
  notificationSubscriptions,
  notificationUsers,
  telegramConnections
} from "../database/schema";
import {
  categoryForEventType,
  ExternalNotificationChannelName,
  NotificationRecipient
} from "./notification-channel";
import { NotificationChannelRegistry } from "./notification-channel.registry";
import { NotificationsService } from "./notifications.service";

@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private readonly notifyBeforeMinutes: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly channels: NotificationChannelRegistry,
    config: ConfigService
  ) {
    this.notifyBeforeMinutes = Number(
      config.get("NOTIFY_BEFORE_MINUTES") ?? 10
    );
  }

  async processBatch(): Promise<number> {
    await Promise.all([
      this.enqueueDueStartReminders(),
      this.enqueueDueEndWarnings()
    ]);
    const jobs = await this.database.orm.transaction(async (tx) => {
      const pending = await tx
        .select({
          id: notificationOutbox.id,
          eventType: notificationOutbox.eventType,
          payload: notificationOutbox.payload,
          attempts: notificationOutbox.attempts
        })
        .from(notificationOutbox)
        .where(
          and(
            inArray(notificationOutbox.status, ["PENDING", "FAILED"]),
            lte(notificationOutbox.nextAttemptAt, sql`now()`),
            lt(notificationOutbox.attempts, 8)
          )
        )
        .orderBy(notificationOutbox.createdAt)
        .limit(20)
        .for("update", { skipLocked: true });
      if (pending.length) {
        await tx
          .update(notificationOutbox)
          .set({
            status: "PROCESSING",
            attempts: sql`${notificationOutbox.attempts} + 1`
          })
          .where(
            inArray(
              notificationOutbox.id,
              pending.map((job) => job.id)
            )
          );
      }
      return pending;
    });

    for (const job of jobs) {
      try {
        await this.deliver(job.payload, job.eventType);
        await this.database.orm
          .update(notificationOutbox)
          .set({
            status: "SENT",
            processedAt: sql`now()`,
            lastError: null
          })
          .where(eq(notificationOutbox.id, job.id));
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 500) : String(error);
        const delayMinutes = Math.min(60, 2 ** Math.min(job.attempts, 5));
        await this.database.orm
          .update(notificationOutbox)
          .set({
            status: "FAILED",
            lastError: message,
            nextAttemptAt: sql`now() + (${String(
              delayMinutes
            )} || ' minutes')::interval`
          })
          .where(eq(notificationOutbox.id, job.id));
        this.logger.warn(`Delivery ${job.id} failed: ${message}`);
      }
    }
    return jobs.length;
  }

  private async deliver(
    payload: typeof notificationOutbox.$inferSelect.payload,
    eventType: string
  ): Promise<void> {
    if (payload.activeBookingIds?.length) {
      const bookingIds = [...new Set(payload.activeBookingIds)];
      const active = await this.database.orm
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationBookings)
        .where(
          and(
            inArray(notificationBookings.id, bookingIds),
            isNull(notificationBookings.cancelledAt)
          )
        );
      if (Number(active[0]?.count ?? 0) !== bookingIds.length) return;
    }
    const targetRows = await this.database.orm
      .select({
        email: notificationUsers.email,
        telegramChatId: telegramConnections.chatId
      })
      .from(notificationUsers)
      .leftJoin(
        telegramConnections,
        eq(telegramConnections.userId, notificationUsers.id)
      )
      .where(eq(notificationUsers.id, payload.userId))
      .limit(1);
    const target = targetRows[0];
    if (!target) return;
    const subscriptions = await this.database.orm
      .select({ channel: notificationSubscriptions.channel })
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.userId, payload.userId),
          eq(
            notificationSubscriptions.category,
            payload.category ?? categoryForEventType(eventType)
          ),
          eq(notificationSubscriptions.enabled, true),
          inArray(notificationSubscriptions.channel, ["EMAIL", "TELEGRAM"])
        )
      );
    const enabledChannels = subscriptions
      .map(({ channel }) => channel)
      .filter(
        (channel): channel is ExternalNotificationChannelName =>
          channel === "EMAIL" || channel === "TELEGRAM"
      );
    const recipient: NotificationRecipient = {
      userId: payload.userId,
      email: target.email,
      telegramChatId: target.telegramChatId
    };
    await Promise.all(
      enabledChannels.map(async (name) => {
        const channel = this.channels.get(name);
        if (!channel?.isAvailable() || !channel.canDeliver(recipient)) return;
        await channel.deliver(recipient, {
          title: payload.title,
          body: payload.body
        });
      })
    );
  }

  private async enqueueDueStartReminders(): Promise<void> {
    const dueWindow = and(
      isNull(notificationBookings.cancelledAt),
      gt(notificationBookings.startsAt, sql`now()`),
      lte(
        notificationBookings.startsAt,
        sql`now() + (${String(
          this.notifyBeforeMinutes
        )} || ' minutes')::interval`
      )
    );
    const reminderSelection = {
      bookingId: notificationBookings.id,
      title: notificationBookings.title,
      startsAt: notificationBookings.startsAt,
      userId: notificationUsers.id,
      locale: notificationUsers.locale,
      timezone: notificationUsers.timezone
    };
    const [organizers, participants] = await Promise.all([
      this.database.orm
        .select(reminderSelection)
        .from(notificationBookings)
        .innerJoin(
          notificationUsers,
          eq(notificationUsers.id, notificationBookings.organizerId)
        )
        .where(dueWindow),
      this.database.orm
        .select(reminderSelection)
        .from(notificationBookings)
        .innerJoin(
          notificationBookingParticipants,
          eq(
            notificationBookingParticipants.bookingId,
            notificationBookings.id
          )
        )
        .innerJoin(
          notificationUsers,
          eq(notificationUsers.id, notificationBookingParticipants.userId)
        )
        .where(
          and(
            dueWindow,
            eq(notificationBookingParticipants.status, "ACCEPTED")
          )
        )
    ]);
    const reminders = [
      ...new Map(
        [...organizers, ...participants].map((reminder) => [
          `${reminder.bookingId}:${reminder.userId}`,
          reminder
        ])
      ).values()
    ];

    for (const reminder of reminders) {
      const locale = reminder.locale === "en" ? "en-GB" : "uk-UA";
      const formatted = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: reminder.timezone ?? "Europe/Kyiv"
      }).format(reminder.startsAt);
      await this.database.transaction((client) =>
        this.notifications.enqueue(client, {
          eventKey: `booking:${reminder.bookingId}:reminder:${reminder.userId}`,
          userId: reminder.userId,
          type: "BOOKING_REMINDER",
          category: "REMINDERS",
          title:
            reminder.locale === "en"
              ? "Meeting starts soon"
              : "Зустріч скоро почнеться",
          body:
            reminder.locale === "en"
              ? `“${reminder.title}” starts at ${formatted}.`
              : `«${reminder.title}» починається о ${formatted}.`,
          bookingId: reminder.bookingId,
          activeBookingIds: [reminder.bookingId]
        })
      );
    }
  }

  private async enqueueDueEndWarnings(): Promise<void> {
    const nextBooking = alias(notificationBookings, "next_booking");
    const warnings = await this.database.orm
      .select({
        bookingId: notificationBookings.id,
        title: notificationBookings.title,
        endsAt: notificationBookings.endsAt,
        nextBookingId: nextBooking.id,
        nextTitle: nextBooking.title,
        userId: notificationBookings.organizerId,
        locale: notificationUsers.locale,
        timezone: notificationUsers.timezone
      })
      .from(notificationBookings)
      .innerJoin(
        nextBooking,
        and(
          eq(nextBooking.roomId, notificationBookings.roomId),
          eq(nextBooking.startsAt, notificationBookings.endsAt),
          isNull(nextBooking.cancelledAt)
        )
      )
      .innerJoin(
        notificationUsers,
        eq(notificationUsers.id, notificationBookings.organizerId)
      )
      .where(
        and(
          isNull(notificationBookings.cancelledAt),
          gt(notificationBookings.endsAt, sql`now()`),
          lte(
            notificationBookings.endsAt,
            sql`now() + (${String(
              this.notifyBeforeMinutes
            )} || ' minutes')::interval`
          )
        )
      );

    for (const warning of warnings) {
      const locale = warning.locale === "en" ? "en-GB" : "uk-UA";
      const formatted = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: warning.timezone ?? "Europe/Kyiv"
      }).format(warning.endsAt);
      await this.database.transaction((client) =>
        this.notifications.enqueue(client, {
          eventKey: `booking:${warning.bookingId}:end-warning:${warning.userId}`,
          userId: warning.userId,
          type: "BOOKING_END_WARNING",
          category: "REMINDERS",
          title:
            warning.locale === "en"
              ? "The next slot is occupied"
              : "Наступний слот уже зайнятий",
          body:
            warning.locale === "en"
              ? `“${warning.title}” ends at ${formatted}. “${warning.nextTitle}” starts immediately after it.`
              : `«${warning.title}» завершується о ${formatted}. Одразу після неї починається «${warning.nextTitle}».`,
          bookingId: warning.bookingId,
          activeBookingIds: [warning.bookingId, warning.nextBookingId]
        })
      );
    }
  }
}
