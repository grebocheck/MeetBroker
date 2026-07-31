import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { BookingAttendeesService } from "./booking-attendees.service";
import { BookingCancellationsService } from "./booking-cancellations.service";
import { BookingCreationService } from "./booking-creation.service";
import { BookingImagesService } from "./booking-images.service";
import { BookingInvitationsService } from "./booking-invitations.service";
import { BookingQueriesService } from "./booking-queries.service";
import { BookingUpdatesService } from "./booking-updates.service";
import { BookingsController } from "./bookings.controller";
import { OpenEventsService } from "./open-events.service";

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController],
  providers: [
    BookingAttendeesService,
    BookingCancellationsService,
    BookingCreationService,
    BookingImagesService,
    BookingInvitationsService,
    BookingQueriesService,
    BookingUpdatesService,
    OpenEventsService,
  ],
})
export class BookingsModule {}
