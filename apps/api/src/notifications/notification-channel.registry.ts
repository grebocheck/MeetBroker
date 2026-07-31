import { Injectable } from "@nestjs/common";
import {
  ExternalNotificationChannelName,
  NotificationChannel,
} from "./notification-channel";
import { EmailNotificationChannel } from "./email-notification.channel";
import { TelegramNotificationChannel } from "./telegram-notification.channel";

@Injectable()
export class NotificationChannelRegistry {
  private readonly channels: ReadonlyMap<
    ExternalNotificationChannelName,
    NotificationChannel
  >;

  constructor(
    email: EmailNotificationChannel,
    telegram: TelegramNotificationChannel,
  ) {
    this.channels = new Map<
      ExternalNotificationChannelName,
      NotificationChannel
    >([
      [email.name, email],
      [telegram.name, telegram],
    ]);
  }

  get(name: ExternalNotificationChannelName): NotificationChannel | undefined {
    return this.channels.get(name);
  }

  available(): NotificationChannel[] {
    return [...this.channels.values()].filter((channel) =>
      channel.isAvailable(),
    );
  }
}
