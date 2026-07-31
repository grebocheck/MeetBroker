import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { AccessPoliciesService } from "../access-policies/access-policies.service";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import { recordActivity } from "../common/record-activity";
import type { CurrentUser, Locale } from "../common/types";
import { localize } from "../common/localization";
import { NotificationsService } from "../notifications/notifications.service";
import type { UpdateBookingDto } from "./bookings.dto";
import {
  bookingRuleMessage,
  BookingRuleError,
  normalizeMeetingUrl,
  validateBookingRules,
  validateMeetingRules,
} from "./booking-rules";
import {
  bookingChangeCopy,
  bookingInvitationCopy,
  bookingRemovalCopy,
} from "./booking-notification-copy";
import {
  BookingAttendeesService,
  type ParticipantRow,
} from "./booking-attendees.service";

@Injectable()
export class BookingUpdatesService {
  private readonly officeTimeZone: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly accessPolicies: AccessPoliciesService,
    private readonly bookingAttendees: BookingAttendeesService,
    config: ConfigService,
  ) {
    this.officeTimeZone =
      config.get<string>("OFFICE_TIMEZONE") ?? "Europe/Kyiv";
  }

  async update(
    user: CurrentUser,
    bookingId: string,
    dto: UpdateBookingDto,
  ): Promise<void> {
    const title = dto.title.trim();
    if (!title) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "TITLE_REQUIRED",
        "Booking title is required",
      );
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const requestedParticipantIds = [...new Set(dto.participantIds)];

    await this.database.transaction(async (client) => {
      const bookingResult = await client.query<{
        id: string;
        title: string;
        starts_at: Date;
        ends_at: Date;
        participation_mode: "INVITE_ONLY" | "OPEN";
        meeting_type: "ROOM" | "ONLINE";
        meeting_url: string | null;
        organizer_id: string;
        organizer_locale: Locale;
        cancelled_at: Date | null;
        room_id: string | null;
        room_name: string | null;
        capacity: number | null;
        work_start: string | null;
        work_end: string | null;
        working_days: number[] | null;
        active: boolean | null;
      }>(
        `
          select
            b.id,
            b.title,
            b.starts_at,
            b.ends_at,
            b.participation_mode,
            b.meeting_type,
            b.meeting_url,
            b.organizer_id,
            organizer.locale as organizer_locale,
            b.cancelled_at,
            r.id as room_id,
            r.name as room_name,
            r.capacity,
            r.work_start::text,
            r.work_end::text,
            r.working_days,
            r.active
          from bookings b
          join users organizer on organizer.id = b.organizer_id
          left join rooms r on r.id = b.room_id
          where b.id = $1
          for update of b
        `,
        [bookingId],
      );
      const booking = bookingResult.rows[0];
      if (
        !booking ||
        booking.cancelled_at ||
        (booking.meeting_type === "ROOM" && !booking.active)
      ) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "BOOKING_NOT_FOUND",
          "Booking was not found",
        );
      }
      const adminReason = dto.adminReason?.trim();
      const isAdministrativeUpdate =
        user.role === "ADMIN" && Boolean(adminReason);
      if (booking.organizer_id !== user.id && user.role !== "ADMIN") {
        throw apiError(
          HttpStatus.FORBIDDEN,
          "NOT_BOOKING_OWNER",
          "Only the organizer can edit this booking",
        );
      }
      if (
        booking.organizer_id !== user.id &&
        (!adminReason || adminReason.length < 3)
      ) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "ADMIN_EDIT_REASON_REQUIRED",
          "Administrator must provide an edit reason of at least 3 characters",
        );
      }
      const participantIds = requestedParticipantIds.filter(
        (id) => id !== booking.organizer_id,
      );

      const meetingUrl =
        booking.meeting_type === "ONLINE"
          ? normalizeMeetingUrl(dto.meetingUrl ?? booking.meeting_url)
          : null;
      if (booking.meeting_type === "ROOM" && booking.room_id) {
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [
          booking.room_id,
        ]);
      }
      const ruleError =
        booking.meeting_type === "ROOM" &&
        booking.work_start &&
        booking.work_end &&
        booking.working_days
          ? validateBookingRules({
              startsAt,
              endsAt,
              now: new Date(),
              officeTimeZone: this.officeTimeZone,
              workStart: booking.work_start,
              workEnd: booking.work_end,
              workingDays: booking.working_days,
            })
          : validateMeetingRules({
              startsAt,
              endsAt,
              now: new Date(),
              officeTimeZone: this.officeTimeZone,
            });
      if (
        ruleError &&
        !(
          user.role === "ADMIN" &&
          adminReason &&
          (ruleError === "OUTSIDE_WORKING_HOURS" ||
            ruleError === "OUTSIDE_WORKING_DAYS")
        )
      ) {
        throw this.ruleException(ruleError);
      }

      if (booking.meeting_type === "ROOM" && booking.room_id) {
        const block = await client.query(
          `
            select id
            from room_blocks
            where room_id = $1
              and cancelled_at is null
              and starts_at < $3
              and ends_at > $2
            limit 1
          `,
          [booking.room_id, startsAt, endsAt],
        );
        if (block.rowCount && !(user.role === "ADMIN" && adminReason)) {
          throw apiError(
            HttpStatus.CONFLICT,
            "ROOM_UNAVAILABLE",
            "Room is unavailable during this time",
          );
        }
      }
      if (
        booking.meeting_type === "ROOM" &&
        booking.capacity !== null &&
        participantIds.length + 1 > booking.capacity
      ) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "ROOM_CAPACITY_EXCEEDED",
          "Number of participants exceeds room capacity",
        );
      }

      const participants = await this.bookingAttendees.loadEligible(
        client,
        participantIds,
      );
      if (participants.length !== participantIds.length) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "INVALID_PARTICIPANT",
          "One or more participants are unavailable",
        );
      }
      const currentParticipants = await client.query<
        ParticipantRow & { status: "INVITED" | "ACCEPTED" | "DECLINED" }
      >(
        `
          select u.id, u.name, u.locale, u.timezone, bp.status
          from booking_participants bp
          join users u on u.id = bp.user_id
          where bp.booking_id = $1
        `,
        [bookingId],
      );
      const currentIds = new Set(
        currentParticipants.rows.map((participant) => participant.id),
      );
      const currentStatuses = new Map(
        currentParticipants.rows.map((participant) => [
          participant.id,
          participant.status,
        ]),
      );
      const busyParticipantIds = participantIds.filter(
        (id) => currentStatuses.get(id) !== "DECLINED",
      );
      await this.bookingAttendees.lock(client, [
        booking.organizer_id,
        ...busyParticipantIds,
      ]);
      await this.bookingAttendees.assertAvailable(
        client,
        [booking.organizer_id, ...busyParticipantIds],
        [{ startsAt, endsAt }],
        [bookingId],
      );
      const nextIds = new Set(participantIds);
      const added = participants.filter(
        (participant) => !currentIds.has(participant.id),
      );
      const retained = participants.filter((participant) =>
        currentIds.has(participant.id),
      );
      const removed = currentParticipants.rows.filter(
        (participant) => !nextIds.has(participant.id),
      );
      const detailsChanged =
        booking.title !== title ||
        booking.starts_at.getTime() !== startsAt.getTime() ||
        booking.ends_at.getTime() !== endsAt.getTime() ||
        booking.participation_mode !== dto.participationMode ||
        booking.meeting_url !== meetingUrl;
      if (!detailsChanged && !added.length && !removed.length) return;

      try {
        await client.query(
          `
            update bookings
            set
              title = $2,
              starts_at = $3,
              ends_at = $4,
              participation_mode = $5,
              meeting_url = $6,
              updated_at = now()
            where id = $1
          `,
          [
            bookingId,
            title,
            startsAt,
            endsAt,
            dto.participationMode,
            meetingUrl,
          ],
        );
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          (error as Error & { code: string }).code === "23P01"
        ) {
          throw apiError(
            HttpStatus.CONFLICT,
            "SLOT_TAKEN",
            "This time slot is already booked",
          );
        }
        throw error;
      }

      if (removed.length) {
        await client.query(
          `
            delete from booking_participants
            where booking_id = $1 and user_id = any($2::uuid[])
          `,
          [bookingId, removed.map((participant) => participant.id)],
        );
      }
      for (const participant of added) {
        await client.query(
          `
            insert into booking_participants (booking_id, user_id, status)
            values ($1, $2, 'INVITED')
          `,
          [bookingId, participant.id],
        );
      }

      const editId = randomUUID();
      const locationName = booking.room_name;
      for (const participant of retained) {
        const copy = bookingChangeCopy(
          title,
          locationName,
          startsAt,
          participant,
          this.officeTimeZone,
        );
        await this.notifications.enqueue(client, {
          eventKey: `booking:${bookingId}:update:${editId}:${participant.id}`,
          userId: participant.id,
          type: "BOOKING_UPDATED",
          category: "CHANGES",
          title: isAdministrativeUpdate
            ? localize(participant.locale, "adminChangedTitle")
            : copy.title,
          body: isAdministrativeUpdate
            ? localize(participant.locale, "adminChangedBody", {
                admin: user.name,
                title,
                reason: adminReason!,
                details: copy.body,
              })
            : copy.body,
          bookingId,
        });
      }
      for (const participant of removed) {
        const copy = bookingRemovalCopy(title, participant);
        await this.notifications.enqueue(client, {
          eventKey: `booking:${bookingId}:removed:${editId}:${participant.id}`,
          userId: participant.id,
          type: "BOOKING_PARTICIPANT_REMOVED",
          category: "CHANGES",
          title: isAdministrativeUpdate
            ? localize(participant.locale, "adminRemovedTitle")
            : copy.title,
          body: isAdministrativeUpdate
            ? localize(participant.locale, "adminRemovedBody", {
                admin: user.name,
                title,
                reason: adminReason!,
              })
            : copy.body,
          bookingId,
        });
      }
      for (const participant of added) {
        const copy = bookingInvitationCopy(
          user.name,
          title,
          locationName,
          startsAt,
          participant,
          this.officeTimeZone,
        );
        await this.notifications.enqueue(client, {
          eventKey: `booking:${bookingId}:invite:${editId}:${participant.id}`,
          userId: participant.id,
          type: "BOOKING_INVITATION",
          category: "INVITATIONS",
          title: isAdministrativeUpdate
            ? localize(participant.locale, "adminInvitedTitle")
            : copy.title,
          body: isAdministrativeUpdate
            ? localize(participant.locale, "adminInvitedBody", {
                admin: user.name,
                title,
                location:
                  locationName ?? localize(participant.locale, "online"),
                reason: adminReason!,
              })
            : copy.body,
          bookingId,
        });
      }
      if (isAdministrativeUpdate && booking.organizer_id !== user.id) {
        await this.notifications.enqueue(client, {
          eventKey: `booking:${bookingId}:admin-update:${editId}:${booking.organizer_id}`,
          userId: booking.organizer_id,
          type: "BOOKING_UPDATED",
          category: "CHANGES",
          title: localize(booking.organizer_locale, "adminOrganizerTitle"),
          body: localize(booking.organizer_locale, "adminOrganizerBody", {
            admin: user.name,
            title,
            reason: adminReason!,
          }),
          bookingId,
        });
      }
      await recordActivity(
        client,
        user.id,
        isAdministrativeUpdate ? "BOOKING_UPDATED_BY_ADMIN" : "BOOKING_UPDATED",
        "BOOKING",
        bookingId,
        {
          title,
          roomName: booking.room_name,
          meetingType: booking.meeting_type,
          meetingUrl,
          startsAt,
          endsAt,
          addedParticipants: added.length,
          removedParticipants: removed.length,
          ...(isAdministrativeUpdate ? { reason: adminReason } : {}),
        },
      );
    });
  }

  private ruleException(code: BookingRuleError) {
    return apiError(HttpStatus.BAD_REQUEST, code, bookingRuleMessage(code));
  }
}
