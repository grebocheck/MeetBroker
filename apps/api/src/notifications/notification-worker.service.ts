import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "./notifications.service";

interface OutboxPayload {
  userId: string;
  notificationId: string;
  title: string;
  body: string;
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
  private readonly transporter: Transporter | null;
  private readonly telegramToken: string | undefined;
  private readonly notifyBeforeMinutes: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    config: ConfigService
  ) {
    const smtpHost = config.get<string>("SMTP_HOST");
    this.transporter = smtpHost
      ? nodemailer.createTransport({
          host: smtpHost,
          port: Number(config.get("SMTP_PORT") ?? 587),
          secure: String(config.get("SMTP_SECURE")) === "true",
          auth: config.get<string>("SMTP_USER")
            ? {
                user: config.get<string>("SMTP_USER"),
                pass: config.get<string>("SMTP_PASSWORD")
              }
            : undefined,
          disableFileAccess: true,
          disableUrlAccess: true
        })
      : null;
    this.telegramToken =
      config.get<string>("TELEGRAM_BOT_TOKEN") || undefined;
    this.notifyBeforeMinutes = Number(
      config.get("NOTIFY_BEFORE_MINUTES") ?? 10
    );
  }

  async processBatch(): Promise<number> {
    await this.enqueueDueReminders();
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
    const result = await this.database.query<{
      email: string;
      email_enabled: boolean;
      telegram_enabled: boolean;
      chat_id: string | null;
      invitations: boolean;
      changes: boolean;
      reminders: boolean;
    }>(
      `
        select
          u.email,
          p.email_enabled,
          p.telegram_enabled,
          p.invitations,
          p.changes,
          p.reminders,
          t.chat_id
        from users u
        join notification_preferences p on p.user_id = u.id
        left join telegram_connections t on t.user_id = u.id
        where u.id = $1
      `,
      [payload.userId]
    );
    const target = result.rows[0];
    if (!target) return;
    const typeEnabled =
      eventType === "BOOKING_INVITATION"
        ? target.invitations
        : eventType === "BOOKING_REMINDER"
          ? target.reminders
          : target.changes;
    if (!typeEnabled) return;

    const deliveries: Promise<unknown>[] = [];
    if (target.email_enabled) {
      if (this.transporter) {
        deliveries.push(
          this.transporter.sendMail({
            from:
              process.env.SMTP_FROM ??
              "MeetBroker <notifications@example.com>",
            to: target.email,
            subject: payload.title,
            text: payload.body
          })
        );
      } else {
        this.logger.log(
          `[dev-email] ${target.email}: ${payload.title} — ${payload.body}`
        );
      }
    }

    if (
      target.telegram_enabled &&
      target.chat_id &&
      this.telegramToken
    ) {
      deliveries.push(
        fetch(
          `https://api.telegram.org/bot${this.telegramToken}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: target.chat_id,
              text: `${payload.title}\n\n${payload.body}`
            }),
            signal: AbortSignal.timeout(10_000)
          }
        ).then((response) => {
          if (!response.ok) {
            throw new Error(`Telegram returned ${response.status}`);
          }
        })
      );
    }

    await Promise.all(deliveries);
  }

  private async enqueueDueReminders(): Promise<void> {
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
          title:
            reminder.locale === "en"
              ? "Meeting starts soon"
              : "Зустріч скоро почнеться",
          body:
            reminder.locale === "en"
              ? `“${reminder.title}” starts at ${formatted}.`
              : `«${reminder.title}» починається о ${formatted}.`,
          bookingId: reminder.booking_id
        })
      );
    }
  }
}
