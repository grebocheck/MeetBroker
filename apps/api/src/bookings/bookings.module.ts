import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { BookingAttendeesService } from "./booking-attendees.service";
import { BookingImagesService } from "./booking-images.service";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController],
  providers: [BookingAttendeesService, BookingImagesService, BookingsService],
})
export class BookingsModule {}
