import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AccessPoliciesService } from "../access-policies/access-policies.service";
import { apiError } from "../common/http-error";
import { localize } from "../common/localization";
import { recordActivity } from "../common/record-activity";
import type { CurrentUser, Locale } from "../common/types";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CancelBookingDto } from "./bookings.dto";

@Injectable()
export class BookingCancellationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly accessPolicies: AccessPoliciesService,
  ) {}

  async cancel(
    user: CurrentUser,
    bookingId: string,
    dto: CancelBookingDto,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const bookingResult = await client.query<{
        id: string;
        title: string;
        organizer_id: string;
        room_id: string | null;
        series_id: string | null;
        starts_at: Date;
        cancelled_at: Date | null;
      }>(
        `select id, title, organizer_id, room_id, series_id, starts_at,
                cancelled_at
         from bookings where id = $1 for update`,
        [bookingId],
      );
      const booking = bookingResult.rows[0];
      if (!booking || booking.cancelled_at) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "BOOKING_NOT_FOUND",
          "Booking was not found",
        );
      }
      if (booking.organizer_id !== user.id && user.role !== "ADMIN") {
        throw apiError(
          HttpStatus.FORBIDDEN,
          "NOT_BOOKING_OWNER",
          "Only the organizer can cancel this booking",
        );
      }
      if (booking.organizer_id === user.id) {
        await this.accessPolicies.assertAllowed(
          client,
          user.id,
          "BOOKING_CANCEL_OWN",
          booking.room_id ?? undefined,
        );
      }
      const isAdministrativeCancellation =
        user.role === "ADMIN" && booking.organizer_id !== user.id;
      const cancellationReason = dto.reason?.trim();
      const cancelFuture = dto.scope === "FUTURE" && Boolean(booking.series_id);
      const targets = cancelFuture
        ? await client.query<{
            id: string;
            title: string;
            organizer_id: string;
          }>(
            `
              select id, title, organizer_id
              from bookings
              where series_id = $1
                and starts_at >= $2
                and cancelled_at is null
              order by starts_at
              for update
            `,
            [booking.series_id, booking.starts_at],
          )
        : {
            rows: [
              {
                id: booking.id,
                title: booking.title,
                organizer_id: booking.organizer_id,
              },
            ],
          };
      if (isAdministrativeCancellation) {
        const reason = cancellationReason;
        if (!reason || reason.length < 3) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            "CANCELLATION_REASON_REQUIRED",
            "Administrator must provide a cancellation reason of at least 3 characters",
          );
        }
        await client.query(
          `
            insert into audit_logs
              (id, actor_id, action, target_type, target_id, details)
            values ($1, $2, 'BOOKING_CANCELLED_BY_ADMIN', 'BOOKING', $3, $4)
          `,
          [
            randomUUID(),
            user.id,
            bookingId,
            JSON.stringify({
              reason,
              scope: cancelFuture ? "FUTURE" : "OCCURRENCE",
              seriesId: booking.series_id,
              occurrenceCount: targets.rows.length,
            }),
          ],
        );
      }
      await client.query(
        `
          update bookings
          set cancelled_at = now(), cancelled_by = $2, updated_at = now()
          where id = any($1::uuid[])
        `,
        [targets.rows.map((target) => target.id), user.id],
      );
      if (cancelFuture) {
        await client.query(
          `
            update booking_series
            set cancelled_from = case
              when cancelled_from is null or cancelled_from > $2 then $2
              else cancelled_from
            end
            where id = $1
          `,
          [booking.series_id, booking.starts_at],
        );
      }

      for (const target of targets.rows) {
        const participants = await client.query<{ user_id: string }>(
          "select user_id from booking_participants where booking_id = $1",
          [target.id],
        );
        const recipientIds = new Set(
          participants.rows.map((participant) => participant.user_id),
        );
        if (isAdministrativeCancellation) {
          recipientIds.add(target.organizer_id);
        }
        const recipients = await client.query<{
          id: string;
          locale: Locale;
        }>("select id, locale from users where id = any($1::uuid[])", [
          [...recipientIds],
        ]);
        for (const recipient of recipients.rows) {
          await this.notifications.enqueue(client, {
            eventKey: `booking:${target.id}:cancel:${recipient.id}`,
            userId: recipient.id,
            type: "BOOKING_CANCELLED",
            category: "CHANGES",
            title: localize(recipient.locale, "cancelledTitle"),
            body: cancellationReason
              ? localize(recipient.locale, "cancelledWithReason", {
                  title: target.title,
                  reason: cancellationReason,
                })
              : localize(recipient.locale, "cancelledBody", {
                  title: target.title,
                }),
            bookingId: target.id,
          });
        }
      }
      if (!isAdministrativeCancellation) {
        await recordActivity(
          client,
          user.id,
          cancelFuture ? "BOOKING_SERIES_CANCELLED" : "BOOKING_CANCELLED",
          cancelFuture ? "BOOKING_SERIES" : "BOOKING",
          cancelFuture ? booking.series_id! : bookingId,
          {
            title: booking.title,
            scope: cancelFuture ? "FUTURE" : "OCCURRENCE",
            occurrenceCount: targets.rows.length,
          },
        );
      }
    });
  }
}
