import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { BookingAttendeesService } from "./booking-attendees.service";
import { BookingImagesService } from "./booking-images.service";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { OpenEventsService } from "./open-events.service";

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController],
  providers: [
    BookingAttendeesService,
    BookingImagesService,
    BookingsService,
    OpenEventsService,
  ],
})
export class BookingsModule {}
