import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import type {
  ExternalNotificationChannelName,
  NotificationCategory,
  NotificationChannelName
} from "../../notifications/notification-channel";

export const notificationUsers = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  locale: varchar("locale", { length: 10 }).$type<"uk" | "en">().notNull(),
  timezone: varchar("timezone", { length: 80 })
});

export const notificationBookings = pgTable("bookings", {
  id: uuid("id").primaryKey(),
  roomId: uuid("room_id").notNull(),
  organizerId: uuid("organizer_id")
    .notNull()
    .references(() => notificationUsers.id),
  title: varchar("title", { length: 100 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true })
});

export interface NotificationOutboxPayload {
  userId: string;
  category?: NotificationCategory;
  title: string;
  body: string;
  activeBookingIds?: string[];
  forcedChannels?: ExternalNotificationChannelName[];
  recipientEmail?: string;
}

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => notificationUsers.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 60 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body").notNull(),
    bookingId: uuid("booking_id").references(() => notificationBookings.id, {
      onDelete: "cascade"
    }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index("notifications_user_created_idx").on(
      table.userId,
      table.createdAt.desc()
    )
  ]
);

export const notificationSubscriptions = pgTable(
  "notification_subscriptions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => notificationUsers.id, { onDelete: "cascade" }),
    category: text("category").$type<NotificationCategory>().notNull(),
    channel: text("channel").$type<NotificationChannelName>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.category, table.channel]
    }),
    index("notification_subscriptions_delivery_idx")
      .on(table.userId, table.category, table.channel)
      .where(sql`${table.enabled}`)
  ]
);

export const telegramConnections = pgTable(
  "telegram_connections",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => notificationUsers.id, { onDelete: "cascade" }),
    chatId: text("chat_id").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [unique("telegram_connections_chat_id_key").on(table.chatId)]
);

export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => notificationUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    unique("telegram_link_tokens_token_hash_key").on(table.tokenHash)
  ]
);

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey(),
    eventKey: varchar("event_key", { length: 180 }).notNull(),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    payload: jsonb("payload").$type<NotificationOutboxPayload>().notNull(),
    status: varchar("status", { length: 20 })
      .$type<"PENDING" | "PROCESSING" | "SENT" | "FAILED">()
      .notNull()
      .default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: varchar("last_error", { length: 500 }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    unique("notification_outbox_event_key_key").on(table.eventKey),
    index("notification_outbox_pending_idx")
      .on(table.nextAttemptAt)
      .where(sql`${table.status} in ('PENDING', 'FAILED')`)
  ]
);

export const notificationBookingParticipants = pgTable(
  "booking_participants",
  {
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => notificationBookings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => notificationUsers.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 })
      .$type<"INVITED" | "ACCEPTED" | "DECLINED">()
      .notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.bookingId, table.userId]
    })
  ]
);
