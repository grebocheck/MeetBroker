import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../database/database.service";
import {
  categoryForEventType,
  ExternalNotificationChannelName,
  NotificationCategory,
  NotificationRecipient
} from "./notification-channel";
import { NotificationChannelRegistry } from "./notification-channel.registry";
import { NotificationsService } from "./notifications.service";

interface OutboxPayload {
  userId: string;
  category?: NotificationCategory;
  title: string;
  body: string;
  activeBookingIds?: string[];
}

interface OutboxRow {
  id: string;
  event_type: string;
  payload: OutboxPayload;
  attempts: number;
}

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
    const jobs = await this.database.transaction(async (client) => {
      const result = await client.query<OutboxRow>(
        `
          select id, event_type, payload, attempts
          from notification_outbox
          where status in ('PENDING', 'FAILED')
            and next_attempt_at <= now()
            and attempts < 8
          order by created_at
          limit 20
          for update skip locked
        `
      );
      if (result.rows.length) {
        await client.query(
          `
            update notification_outbox
            set status = 'PROCESSING', attempts = attempts + 1
            where id = any($1::uuid[])
          `,
          [result.rows.map((job) => job.id)]
        );
      }
      return result.rows;
    });

    for (const job of jobs) {
      try {
        await this.deliver(job.payload, job.event_type);
        await this.database.query(
          `
            update notification_outbox
            set status = 'SENT', processed_at = now(), last_error = null
            where id = $1
          `,
          [job.id]
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 500) : String(error);
        const delayMinutes = Math.min(60, 2 ** Math.min(job.attempts, 5));
        await this.database.query(
          `
            update notification_outbox
            set
              status = 'FAILED',
              last_error = $2,
              next_attempt_at = now() + ($3 || ' minutes')::interval
            where id = $1
          `,
          [job.id, message, String(delayMinutes)]
        );
        this.logger.warn(`Delivery ${job.id} failed: ${message}`);
      }
    }
    return jobs.length;
  }

  private async deliver(
    payload: OutboxPayload,
    eventType: string
  ): Promise<void> {
    if (payload.activeBookingIds?.length) {
      const bookingIds = [...new Set(payload.activeBookingIds)];
      const active = await this.database.query<{ count: string }>(
        `
          select count(*)::text as count
          from bookings
          where id = any($1::uuid[])
            and cancelled_at is null
        `,
        [bookingIds]
      );
      if (Number(active.rows[0]?.count ?? 0) !== bookingIds.length) return;
    }
    const result = await this.database.query<{
      email: string;
      telegram_chat_id: string | null;
      enabled_channels: ExternalNotificationChannelName[];
    }>(
      `
        select
          u.email,
          t.chat_id as telegram_chat_id,
          coalesce(
            array_agg(s.channel) filter (
              where s.enabled and s.channel in ('EMAIL', 'TELEGRAM')
            ),
            array[]::text[]
          ) as enabled_channels
        from users u
        left join telegram_connections t on t.user_id = u.id
        left join notification_subscriptions s
          on s.user_id = u.id and s.category = $2
        where u.id = $1
        group by u.id, u.email, t.chat_id
      `,
      [payload.userId, payload.category ?? categoryForEventType(eventType)]
    );
    const target = result.rows[0];
    if (!target) return;
    const recipient: NotificationRecipient = {
      userId: payload.userId,
      email: target.email,
      telegramChatId: target.telegram_chat_id
    };
    await Promise.all(
      target.enabled_channels.map(async (name) => {
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
    const result = await this.database.query<{
      booking_id: string;
      title: string;
      starts_at: Date;
      user_id: string;
      locale: "uk" | "en";
      timezone: string | null;
    }>(
      `
        with recipients as (
          select b.id as booking_id, b.organizer_id as user_id
          from bookings b
          where b.cancelled_at is null
            and b.starts_at > now()
            and b.starts_at <= now() + ($1 || ' minutes')::interval
          union
          select b.id, bp.user_id
          from bookings b
          join booking_participants bp on bp.booking_id = b.id
          where b.cancelled_at is null
            and bp.status = 'ACCEPTED'
            and b.starts_at > now()
            and b.starts_at <= now() + ($1 || ' minutes')::interval
        )
        select
          b.id as booking_id,
          b.title,
          b.starts_at,
          u.id as user_id,
          u.locale,
          u.timezone
        from recipients r
        join bookings b on b.id = r.booking_id
        join users u on u.id = r.user_id
      `,
      [String(this.notifyBeforeMinutes)]
    );

    for (const reminder of result.rows) {
      const locale = reminder.locale === "en" ? "en-GB" : "uk-UA";
      const formatted = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: reminder.timezone ?? "Europe/Kyiv"
      }).format(reminder.starts_at);
      await this.database.transaction((client) =>
        this.notifications.enqueue(client, {
          eventKey: `booking:${reminder.booking_id}:reminder:${reminder.user_id}`,
          userId: reminder.user_id,
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
          bookingId: reminder.booking_id,
          activeBookingIds: [reminder.booking_id]
        })
      );
    }
  }

  private async enqueueDueEndWarnings(): Promise<void> {
    const result = await this.database.query<{
      booking_id: string;
      title: string;
      ends_at: Date;
      next_booking_id: string;
      next_title: string;
      user_id: string;
      locale: "uk" | "en";
      timezone: string | null;
    }>(
      `
        select
          current_booking.id as booking_id,
          current_booking.title,
          current_booking.ends_at,
          next_booking.id as next_booking_id,
          next_booking.title as next_title,
          current_booking.organizer_id as user_id,
          users.locale,
          users.timezone
        from bookings current_booking
        join bookings next_booking
          on next_booking.room_id = current_booking.room_id
          and next_booking.starts_at = current_booking.ends_at
          and next_booking.cancelled_at is null
        join users on users.id = current_booking.organizer_id
        where current_booking.cancelled_at is null
          and current_booking.ends_at > now()
          and current_booking.ends_at
            <= now() + ($1 || ' minutes')::interval
      `,
      [String(this.notifyBeforeMinutes)]
    );

    for (const warning of result.rows) {
      const locale = warning.locale === "en" ? "en-GB" : "uk-UA";
      const formatted = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: warning.timezone ?? "Europe/Kyiv"
      }).format(warning.ends_at);
      await this.database.transaction((client) =>
        this.notifications.enqueue(client, {
          eventKey: `booking:${warning.booking_id}:end-warning:${warning.user_id}`,
          userId: warning.user_id,
          type: "BOOKING_END_WARNING",
          category: "REMINDERS",
          title:
            warning.locale === "en"
              ? "The next slot is occupied"
              : "Наступний слот уже зайнятий",
          body:
            warning.locale === "en"
              ? `“${warning.title}” ends at ${formatted}. “${warning.next_title}” starts immediately after it.`
              : `«${warning.title}» завершується о ${formatted}. Одразу після неї починається «${warning.next_title}».`,
          bookingId: warning.booking_id,
          activeBookingIds: [warning.booking_id, warning.next_booking_id]
        })
      );
    }
  }
}
