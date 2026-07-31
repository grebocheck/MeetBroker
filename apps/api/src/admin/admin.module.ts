import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminQueriesService } from "./admin-queries.service";
import { AdminService } from "./admin.service";
import { NotificationDeliveryOperationsController } from "./notification-delivery-operations.controller";
import { NotificationDeliveryOperationsService } from "./notification-delivery-operations.service";
import { RoomAvailabilityService } from "./room-availability.service";
import { RoomMediaService } from "./room-media.service";

@Module({
  controllers: [AdminController, NotificationDeliveryOperationsController],
  providers: [
    AdminQueriesService,
    AdminService,
    NotificationDeliveryOperationsService,
    RoomAvailabilityService,
    RoomMediaService,
  ],
})
export class AdminModule {}
