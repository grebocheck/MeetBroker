import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { BookingImagesService } from "./booking-images.service";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController],
  providers: [BookingImagesService, BookingsService],
})
export class BookingsModule {}
