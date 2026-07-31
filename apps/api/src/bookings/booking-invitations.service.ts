import { HttpStatus, Injectable } from "@nestjs/common";
import { apiError } from "../common/http-error";
import { recordActivity } from "../common/record-activity";
import { DatabaseService } from "../database/database.service";
import { BookingAttendeesService } from "./booking-attendees.service";
import type { RespondToInvitationDto } from "./bookings.dto";

@Injectable()
export class BookingInvitationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly bookingAttendees: BookingAttendeesService,
  ) {}

  async respond(
    userId: string,
    bookingId: string,
    dto: RespondToInvitationDto,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        bookingId,
      ]);
      const invitation = await client.query<{
        starts_at: Date;
        ends_at: Date;
      }>(
        `
          select b.starts_at, b.ends_at
          from booking_participants bp
          join bookings b on b.id = bp.booking_id
          where bp.booking_id = $1
            and bp.user_id = $2
            and b.cancelled_at is null
            and b.starts_at > now()
            and bp.status = 'INVITED'
          for update of bp
        `,
        [bookingId, userId],
      );
      if (!invitation.rowCount) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "INVITATION_NOT_FOUND",
          "Active invitation was not found",
        );
      }
      if (dto.status === "ACCEPTED") {
        await this.bookingAttendees.lock(client, [userId]);
        await this.bookingAttendees.assertAvailable(
          client,
          [userId],
          invitation.rows,
          [bookingId],
        );
      }
      const result = await client.query(
        `
          update booking_participants bp
          set status = $3, responded_at = now()
          from bookings b
          where bp.booking_id = $1
            and bp.user_id = $2
            and b.id = bp.booking_id
            and b.cancelled_at is null
            and b.starts_at > now()
            and bp.status = 'INVITED'
        `,
        [bookingId, userId, dto.status],
      );
      if (!result.rowCount) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "INVITATION_NOT_FOUND",
          "Active invitation was not found",
        );
      }
      await recordActivity(
        client,
        userId,
        dto.status === "ACCEPTED"
          ? "BOOKING_INVITATION_ACCEPTED"
          : "BOOKING_INVITATION_DECLINED",
        "BOOKING",
        bookingId,
      );
    });
  }
}
