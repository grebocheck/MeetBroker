import { Module } from "@nestjs/common";
import { NotificationWorkerService } from "./notification-worker.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationWorkerService],
  exports: [NotificationsService, NotificationWorkerService]
})
export class NotificationsModule {}
