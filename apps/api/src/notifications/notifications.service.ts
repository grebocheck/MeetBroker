import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";
import {
  notifications,
  notificationOutbox,
  notificationSubscriptions,
  notificationUsers,
  telegramConnections,
  telegramLinkTokens,
} from "../database/schema";
import { createOpaqueToken, hashToken } from "../common/crypto";
import { apiError } from "../common/http-error";
import { localize } from "../common/localization";
import type { UpdateNotificationPreferencesDto } from "./notifications.dto";
import type {
  ExternalNotificationChannelName,
  NotificationCategory,
} from "./notification-channel";
import { TelegramNotificationChannel } from "./telegram-notification.channel";
import {
  normalizeTelegramBotUsername,
  telegramConnectLinks,
} from "./telegram-links";

export interface NotificationEvent {
  eventKey: string;
  userId: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  bookingId?: string;
  activeBookingIds?: string[];
  forcedChannels?: ExternalNotificationChannelName[];
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly botUsername: string | undefined;
  private readonly webhookSecret: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly telegramChannel: TelegramNotificationChannel,
    config: ConfigService,
  ) {
    this.botUsername = normalizeTelegramBotUsername(
      config.get<string>("TELEGRAM_BOT_USERNAME"),
    );
    this.webhookSecret =
      config.get<string>("TELEGRAM_WEBHOOK_SECRET") ?? "change-me";
  }

  async enqueue(client: PoolClient, event: NotificationEvent): Promise<void> {
    const orm = this.database.ormFor(client);
    const notificationId = randomUUID();
    const queued = await orm
      .insert(notificationOutbox)
      .values({
        id: randomUUID(),
        eventKey: event.eventKey,
        eventType: event.type,
        payload: {
          userId: event.userId,
          category: event.category,
          title: event.title,
          body: event.body,
          activeBookingIds: event.activeBookingIds,
          forcedChannels: event.forcedChannels,
        },
      })
      .onConflictDoNothing({ target: notificationOutbox.eventKey })
      .returning({ id: notificationOutbox.id });
    if (!queued.length) return;

    const inAppSubscription = await orm
      .select({ enabled: notificationSubscriptions.enabled })
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.userId, event.userId),
          eq(notificationSubscriptions.category, event.category),
          eq(notificationSubscriptions.channel, "IN_APP"),
          eq(notificationSubscriptions.enabled, true),
        ),
      )
      .limit(1);
    if (!inAppSubscription.length) return;

    await orm.insert(notifications).values({
      id: notificationId,
      userId: event.userId,
      type: event.type,
      title: event.title,
      body: event.body,
      bookingId: event.bookingId ?? null,
    });
  }

  async list(userId: string, page = 1, limit = 12) {
    const normalizedPage = Number.isFinite(page)
      ? Math.max(Math.trunc(page), 1)
      : 1;
    const normalizedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 50)
      : 12;
    const [rows, totals] = await Promise.all([
      this.database.orm
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(normalizedLimit)
        .offset((normalizedPage - 1) * normalizedLimit),
      this.database.orm
        .select({
          total: sql<number>`count(*)::int`,
          unread: sql<number>`count(*) filter (where ${notifications.readAt} is null)::int`,
        })
        .from(notifications)
        .where(eq(notifications.userId, userId)),
    ]);
    const total = Number(totals[0]?.total ?? 0);
    return {
      notifications: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        bookingId: row.bookingId,
        read: Boolean(row.readAt),
        createdAt: row.createdAt,
      })),
      unreadCount: Number(totals[0]?.unread ?? 0),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages: Math.max(Math.ceil(total / normalizedLimit), 1),
      },
    };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.database.orm
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
        ),
      );
  }

  async markAllRead(userId: string): Promise<void> {
    await this.database.orm
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(eq(notifications.userId, userId));
  }

  async getPreferences(userId: string) {
    const [subscriptions, telegram] = await Promise.all([
      this.database.orm
        .select({
          category: notificationSubscriptions.category,
          channel: notificationSubscriptions.channel,
          enabled: notificationSubscriptions.enabled,
        })
        .from(notificationSubscriptions)
        .where(eq(notificationSubscriptions.userId, userId))
        .orderBy(
          asc(notificationSubscriptions.category),
          asc(notificationSubscriptions.channel),
        ),
      this.database.orm
        .select({ userId: telegramConnections.userId })
        .from(telegramConnections)
        .where(eq(telegramConnections.userId, userId))
        .limit(1),
    ]);
    return {
      subscriptions,
      telegramConnected: telegram.length > 0,
      telegramAvailable: Boolean(this.botUsername),
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    await this.database.orm
      .insert(notificationSubscriptions)
      .values({
        userId,
        category: dto.category,
        channel: dto.channel,
        enabled: dto.enabled,
      })
      .onConflictDoUpdate({
        target: [
          notificationSubscriptions.userId,
          notificationSubscriptions.category,
          notificationSubscriptions.channel,
        ],
        set: { enabled: dto.enabled, updatedAt: sql`now()` },
      });
    return this.getPreferences(userId);
  }

  async createTelegramLink(userId: string) {
    if (!this.botUsername) {
      throw apiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "TELEGRAM_NOT_CONFIGURED",
        "Telegram bot is not configured",
      );
    }
    const token = createOpaqueToken();
    await this.database.orm.insert(telegramLinkTokens).values({
      id: randomUUID(),
      userId,
      tokenHash: hashToken(token),
      expiresAt: sql`now() + interval '10 minutes'`,
    });
    const links = telegramConnectLinks(this.botUsername, token);
    return {
      ...links,
      botUsername: this.botUsername,
      expiresInSeconds: 600,
    };
  }

  async disconnectTelegram(userId: string): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      await tx
        .delete(telegramConnections)
        .where(eq(telegramConnections.userId, userId));
      await tx
        .update(notificationSubscriptions)
        .set({ enabled: false, updatedAt: sql`now()` })
        .where(
          and(
            eq(notificationSubscriptions.userId, userId),
            eq(notificationSubscriptions.channel, "TELEGRAM"),
          ),
        );
    });
  }

  async sendTelegramTest(userId: string): Promise<void> {
    const connection = await this.database.orm
      .select({
        userId: telegramConnections.userId,
        locale: notificationUsers.locale,
      })
      .from(telegramConnections)
      .innerJoin(
        notificationUsers,
        eq(notificationUsers.id, telegramConnections.userId),
      )
      .where(eq(telegramConnections.userId, userId))
      .limit(1);
    if (!connection.length) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "TELEGRAM_NOT_CONNECTED",
        "Telegram is not connected",
      );
    }
    await this.database.transaction((client) =>
      this.enqueue(client, {
        eventKey: `telegram-test:${userId}:${randomUUID()}`,
        userId,
        type: "TELEGRAM_TEST",
        category: "REMINDERS",
        title: "MeetBroker · Telegram",
        body: localize(connection[0].locale, "telegramTest"),
        forcedChannels: ["TELEGRAM"],
      }),
    );
  }

  async handleTelegramStart(
    secret: string,
    text: string | undefined,
    chatId: string | undefined,
  ): Promise<{ connected: boolean; chatId?: string }> {
    if (secret !== this.webhookSecret || !chatId) {
      throw apiError(HttpStatus.NOT_FOUND, "NOT_FOUND", "Webhook not found");
    }
    return this.connectTelegramStart(text, chatId);
  }

  async connectTelegramStart(
    text: string | undefined,
    chatId: string | undefined,
  ): Promise<{ connected: boolean; chatId?: string }> {
    if (!chatId) return { connected: false };
    const token = text?.match(/^\/start(?:@\w+)?\s+(\S+)$/)?.[1];
    if (!token) return { connected: false };

    const userId = await this.database.orm.transaction(async (tx) => {
      const consumed = await tx
        .update(telegramLinkTokens)
        .set({ usedAt: sql`now()` })
        .where(
          and(
            eq(telegramLinkTokens.tokenHash, hashToken(token)),
            isNull(telegramLinkTokens.usedAt),
            gt(telegramLinkTokens.expiresAt, sql`now()`),
          ),
        )
        .returning({ userId: telegramLinkTokens.userId });
      const connectedUserId = consumed[0]?.userId;
      if (!connectedUserId) return undefined;

      await tx
        .insert(telegramConnections)
        .values({ userId: connectedUserId, chatId })
        .onConflictDoUpdate({
          target: telegramConnections.userId,
          set: { chatId, connectedAt: sql`now()` },
        });
      return connectedUserId;
    });
    if (!userId) return { connected: false };
    const [connectedUser] = await this.database.orm
      .select({ locale: notificationUsers.locale })
      .from(notificationUsers)
      .where(eq(notificationUsers.id, userId))
      .limit(1);
    try {
      await this.telegramChannel.deliver(
        { userId, email: "", telegramChatId: chatId },
        {
          title: "MeetBroker",
          body: localize(connectedUser?.locale ?? "uk", "telegramConnected"),
        },
      );
    } catch (error) {
      this.logger.warn(
        `Telegram connection acknowledgement failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return { connected: true, chatId };
  }
}
