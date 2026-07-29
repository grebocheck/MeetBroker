import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { DatabaseService, SqlExecutor } from "../database/database.service";
import { createOpaqueToken, hashToken } from "../common/crypto";
import { apiError } from "../common/http-error";
import type { UpdateNotificationPreferencesDto } from "./notifications.dto";

export interface NotificationEvent {
  eventKey: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  bookingId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly botUsername: string | undefined;
  private readonly webhookSecret: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService
  ) {
    this.botUsername = config.get<string>("TELEGRAM_BOT_USERNAME") || undefined;
    this.webhookSecret =
      config.get<string>("TELEGRAM_WEBHOOK_SECRET") ?? "change-me";
  }

  async enqueue(
    executor: SqlExecutor,
    event: NotificationEvent
  ): Promise<void> {
    const notificationId = randomUUID();
    const queued = await executor.query(
      `
        insert into notification_outbox
          (id, event_key, event_type, payload)
        values ($1, $2, $3, $4::jsonb)
        on conflict (event_key) do nothing
        returning id
      `,
      [
        randomUUID(),
        event.eventKey,
        event.type,
        JSON.stringify({
          userId: event.userId,
          notificationId,
          title: event.title,
          body: event.body
        })
      ]
    );
    if (!queued.rowCount) return;

    await executor.query(
      `
        insert into notifications
          (id, user_id, type, title, body, booking_id)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        notificationId,
        event.userId,
        event.type,
        event.title,
        event.body,
        event.bookingId ?? null
      ]
    );
  }

  async list(userId: string, limit = 30) {
    const result = await this.database.query<{
      id: string;
      type: string;
      title: string;
      body: string;
      booking_id: string | null;
      read_at: Date | null;
      created_at: Date;
    }>(
      `
        select id, type, title, body, booking_id, read_at, created_at
        from notifications
        where user_id = $1
        order by created_at desc
        limit $2
      `,
      [userId, Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      bookingId: row.booking_id,
      read: Boolean(row.read_at),
      createdAt: row.created_at
    }));
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.database.query(
      `
        update notifications
        set read_at = coalesce(read_at, now())
        where id = $1 and user_id = $2
      `,
      [notificationId, userId]
    );
  }

  async getPreferences(userId: string) {
    const result = await this.database.query<{
      email_enabled: boolean;
      telegram_enabled: boolean;
      invitations: boolean;
      changes: boolean;
      reminders: boolean;
      telegram_connected: boolean;
    }>(
      `
        select
          p.email_enabled,
          p.telegram_enabled,
          p.invitations,
          p.changes,
          p.reminders,
          (t.user_id is not null) as telegram_connected
        from notification_preferences p
        left join telegram_connections t on t.user_id = p.user_id
        where p.user_id = $1
      `,
      [userId]
    );
    const row = result.rows[0];
    return {
      emailEnabled: row.email_enabled,
      telegramEnabled: row.telegram_enabled,
      invitations: row.invitations,
      changes: row.changes,
      reminders: row.reminders,
      telegramConnected: row.telegram_connected,
      telegramAvailable: Boolean(this.botUsername)
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto
  ) {
    await this.database.query(
      `
        update notification_preferences
        set
          email_enabled = coalesce($2, email_enabled),
          telegram_enabled = coalesce($3, telegram_enabled),
          invitations = coalesce($4, invitations),
          changes = coalesce($5, changes),
          reminders = coalesce($6, reminders),
          updated_at = now()
        where user_id = $1
      `,
      [
        userId,
        dto.emailEnabled ?? null,
        dto.telegramEnabled ?? null,
        dto.invitations ?? null,
        dto.changes ?? null,
        dto.reminders ?? null
      ]
    );
    return this.getPreferences(userId);
  }

  async createTelegramLink(userId: string) {
    if (!this.botUsername) {
      throw apiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "TELEGRAM_NOT_CONFIGURED",
        "Telegram bot is not configured"
      );
    }
    const token = createOpaqueToken();
    await this.database.query(
      `
        insert into telegram_link_tokens
          (id, user_id, token_hash, expires_at)
        values ($1, $2, $3, now() + interval '10 minutes')
      `,
      [randomUUID(), userId, hashToken(token)]
    );
    return {
      url: `https://t.me/${this.botUsername}?start=${token}`,
      expiresInSeconds: 600
    };
  }

  async disconnectTelegram(userId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        "delete from telegram_connections where user_id = $1",
        [userId]
      );
      await client.query(
        `
          update notification_preferences
          set telegram_enabled = false, updated_at = now()
          where user_id = $1
        `,
        [userId]
      );
    });
  }

  async handleTelegramStart(
    secret: string,
    text: string | undefined,
    chatId: string | undefined
  ): Promise<{ connected: boolean; chatId?: string }> {
    if (secret !== this.webhookSecret || !chatId) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Webhook not found"
      );
    }
    const token = text?.match(/^\/start\s+(\S+)$/)?.[1];
    if (!token) return { connected: false };

    const result = await this.database.query<{ user_id: string }>(
      `
        update telegram_link_tokens
        set used_at = now()
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        returning user_id
      `,
      [hashToken(token)]
    );
    const userId = result.rows[0]?.user_id;
    if (!userId) return { connected: false };

    await this.database.transaction(async (client) => {
      await client.query(
        `
          insert into telegram_connections (user_id, chat_id)
          values ($1, $2)
          on conflict (user_id)
          do update set chat_id = excluded.chat_id, connected_at = now()
        `,
        [userId, chatId]
      );
      await client.query(
        `
          update notification_preferences
          set telegram_enabled = true, updated_at = now()
          where user_id = $1
        `,
        [userId]
      );
    });
    return { connected: true, chatId };
  }
}
