import { Module } from "@nestjs/common";
import { EmailNotificationChannel } from "./email-notification.channel";
import { NotificationChannelRegistry } from "./notification-channel.registry";
import { NotificationWorkerService } from "./notification-worker.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { TelegramNotificationChannel } from "./telegram-notification.channel";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationWorkerService,
    EmailNotificationChannel,
    TelegramNotificationChannel,
    NotificationChannelRegistry
  ],
  exports: [NotificationsService, NotificationWorkerService]
})
export class NotificationsModule {}
