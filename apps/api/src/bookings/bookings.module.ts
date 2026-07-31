import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { BookingAttendeesService } from "./booking-attendees.service";
import { BookingImagesService } from "./booking-images.service";
import { BookingInvitationsService } from "./booking-invitations.service";
import { BookingQueriesService } from "./booking-queries.service";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { OpenEventsService } from "./open-events.service";

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController],
  providers: [
    BookingAttendeesService,
    BookingImagesService,
    BookingInvitationsService,
    BookingQueriesService,
    BookingsService,
    OpenEventsService,
  ],
})
export class BookingsModule {}
