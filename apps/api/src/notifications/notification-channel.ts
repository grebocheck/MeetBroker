export const NOTIFICATION_CATEGORIES = [
  "INVITATIONS",
  "CHANGES",
  "REMINDERS",
  "ACCESS"
] as const;

export const NOTIFICATION_CHANNELS = [
  "IN_APP",
  "EMAIL",
  "TELEGRAM"
] as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationChannelName =
  (typeof NOTIFICATION_CHANNELS)[number];
export type ExternalNotificationChannelName = Exclude<
  NotificationChannelName,
  "IN_APP"
>;

export interface NotificationRecipient {
  userId: string;
  email: string;
  telegramChatId: string | null;
}

export interface NotificationMessage {
  title: string;
  body: string;
}

export abstract class NotificationChannel {
  abstract readonly name: ExternalNotificationChannelName;

  abstract isAvailable(): boolean;

  abstract canDeliver(recipient: NotificationRecipient): boolean;

  abstract deliver(
    recipient: NotificationRecipient,
    message: NotificationMessage
  ): Promise<void>;
}

export function categoryForEventType(
  eventType: string
): NotificationCategory {
  if (eventType === "BOOKING_INVITATION") return "INVITATIONS";
  if (
    eventType === "BOOKING_REMINDER" ||
    eventType === "BOOKING_END_WARNING"
  ) {
    return "REMINDERS";
  }
  if (eventType.startsWith("ACCESS_")) return "ACCESS";
  return "CHANGES";
}
