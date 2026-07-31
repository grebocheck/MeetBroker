import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { NotificationDeliveryOperationsController } from "./notification-delivery-operations.controller";
import { NotificationDeliveryOperationsService } from "./notification-delivery-operations.service";

@Module({
  controllers: [AdminController, NotificationDeliveryOperationsController],
  providers: [AdminService, NotificationDeliveryOperationsService],
})
export class AdminModule {}
