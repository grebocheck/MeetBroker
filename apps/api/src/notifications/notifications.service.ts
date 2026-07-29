import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DatabaseService, SqlExecutor } from "../database/database.service";
import {
  notifications,
  notificationSubscriptions,
  telegramConnections
} from "../database/schema";
import { createOpaqueToken, hashToken } from "../common/crypto";
import { apiError } from "../common/http-error";
import type { UpdateNotificationPreferencesDto } from "./notifications.dto";
import type { NotificationCategory } from "./notification-channel";

export interface NotificationEvent {
  eventKey: string;
  userId: string;
  type: string;
  category: NotificationCategory;
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
          category: event.category,
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
        select $1, $2, $3, $4, $5, $6
        where exists (
          select 1
          from notification_subscriptions
          where user_id = $2
            and category = $7
            and channel = 'IN_APP'
            and enabled
        )
      `,
      [
        notificationId,
        event.userId,
        event.type,
        event.title,
        event.body,
        event.bookingId ?? null,
        event.category
      ]
    );
  }

  async list(userId: string, limit = 30) {
    const rows = await this.database.orm
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      bookingId: row.bookingId,
      read: Boolean(row.readAt),
      createdAt: row.createdAt
    }));
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.database.orm
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        )
      );
  }

  async getPreferences(userId: string) {
    const [subscriptions, telegram] = await Promise.all([
      this.database.orm
        .select({
          category: notificationSubscriptions.category,
          channel: notificationSubscriptions.channel,
          enabled: notificationSubscriptions.enabled
        })
        .from(notificationSubscriptions)
        .where(eq(notificationSubscriptions.userId, userId))
        .orderBy(
          asc(notificationSubscriptions.category),
          asc(notificationSubscriptions.channel)
        ),
      this.database.orm
        .select({ userId: telegramConnections.userId })
        .from(telegramConnections)
        .where(eq(telegramConnections.userId, userId))
        .limit(1)
    ]);
    return {
      subscriptions,
      telegramConnected: telegram.length > 0,
      telegramAvailable: Boolean(this.botUsername)
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto
  ) {
    await this.database.orm
      .insert(notificationSubscriptions)
      .values({
        userId,
        category: dto.category,
        channel: dto.channel,
        enabled: dto.enabled
      })
      .onConflictDoUpdate({
        target: [
          notificationSubscriptions.userId,
          notificationSubscriptions.category,
          notificationSubscriptions.channel
        ],
        set: { enabled: dto.enabled, updatedAt: new Date() }
      });
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
          update notification_subscriptions
          set enabled = false, updated_at = now()
          where user_id = $1 and channel = 'TELEGRAM'
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
    });
    return { connected: true, chatId };
  }
}
