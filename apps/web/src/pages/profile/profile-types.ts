export type NotificationCategory =
  "INVITATIONS" | "CHANGES" | "REMINDERS" | "ACCESS";

export type NotificationChannel = "IN_APP" | "EMAIL" | "TELEGRAM";

export interface NotificationSubscription {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationPreferences {
  subscriptions: NotificationSubscription[];
  telegramConnected: boolean;
  telegramAvailable: boolean;
}
