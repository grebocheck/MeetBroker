import { Module } from "@nestjs/common";
import { EmailNotificationChannel } from "./email-notification.channel";
import { NotificationChannelRegistry } from "./notification-channel.registry";
import { NotificationWorkerService } from "./notification-worker.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { TelegramNotificationChannel } from "./telegram-notification.channel";
import { TelegramPollingService } from "./telegram-polling.service";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationWorkerService,
    EmailNotificationChannel,
    TelegramNotificationChannel,
    TelegramPollingService,
    NotificationChannelRegistry,
  ],
  exports: [
    NotificationsService,
    NotificationWorkerService,
    TelegramPollingService,
  ],
})
export class NotificationsModule {}
