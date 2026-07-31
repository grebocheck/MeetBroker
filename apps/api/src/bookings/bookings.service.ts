import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AccessPoliciesService } from "../access-policies/access-policies.service";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import { recordActivity } from "../common/record-activity";
import type { CurrentUser, Locale } from "../common/types";
import { localize } from "../common/localization";
import { NotificationsService } from "../notifications/notifications.service";
import type {
  CancelBookingDto,
  CreateBookingDto,
  RespondToInvitationDto,
  UpdateBookingDto,
} from "./bookings.dto";
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
  buildRecurrenceOccurrences,
  RecurrenceError,
  type RecurrenceOccurrence,
} from "./recurrence";
import {
  BookingAttendeesService,
  type ParticipantRow,
} from "./booking-attendees.service";
import { BookingImagesService } from "./booking-images.service";

interface RoomRow {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  work_start: string;
  work_end: string;
  working_days: number[];
  image_path: string | null;
  image_url: string | null;
  active: boolean;
}

@Injectable()
export class BookingsService {
  private readonly officeTimeZone: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly accessPolicies: AccessPoliciesService,
    private readonly bookingImages: BookingImagesService,
    private readonly bookingAttendees: BookingAttendeesService,
    config: ConfigService,
  ) {
    this.officeTimeZone =
      config.get<string>("OFFICE_TIMEZONE") ?? "Europe/Kyiv";
  }

  async create(user: CurrentUser, dto: CreateBookingDto) {
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
    const meetingType = dto.meetingType ?? "ROOM";
    const meetingUrl =
      meetingType === "ONLINE" ? normalizeMeetingUrl(dto.meetingUrl) : null;
    if (meetingType === "ROOM" && !dto.roomId) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "ROOM_REQUIRED",
        "A room is required for an in-person meeting",
      );
    }
    if (meetingType === "ONLINE" && !meetingUrl) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "MEETING_URL_REQUIRED",
        "An HTTPS meeting link is required for an online meeting",
      );
    }
    const participantIds = [
      ...new Set((dto.participantIds ?? []).filter((id) => id !== user.id)),
    ];
    const recurrence = dto.recurrence ?? "NONE";
    const recurrenceInterval = dto.recurrenceInterval ?? 1;
    const weekdays =
      recurrence === "WEEKLY"
        ? [...new Set(dto.weekdays ?? [])].sort((a, b) => a - b)
        : null;
    const recurrenceTimeZone = user.timezone ?? this.officeTimeZone;
    let occurrences: RecurrenceOccurrence[] = [{ startsAt, endsAt }];

    if (recurrence !== "NONE") {
      if (!dto.recurrenceUntil) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "RECURRENCE_END_REQUIRED",
          "Recurring booking must have an end date",
        );
      }
      if (recurrence === "WEEKLY" && !weekdays?.length) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "RECURRENCE_WEEKDAYS_REQUIRED",
          "Weekly recurrence must include at least one weekday",
        );
      }
      try {
        occurrences = buildRecurrenceOccurrences({
          startsAt,
          endsAt,
          frequency: recurrence,
          interval: recurrenceInterval,
          weekdays,
          until: dto.recurrenceUntil,
          timeZone: recurrenceTimeZone,
        });
      } catch (error) {
        if (!(error instanceof RecurrenceError)) throw error;
        const mapped = {
          INVALID_RANGE: [
            "INVALID_RECURRENCE_RANGE",
            "Recurrence must end between its start date and one year later",
          ],
          EMPTY: [
            "EMPTY_RECURRENCE",
            "Recurrence does not produce any bookings",
          ],
          TOO_MANY: [
            "TOO_MANY_OCCURRENCES",
            "A booking series cannot contain more than 100 events",
          ],
        }[error.code];
        throw apiError(HttpStatus.BAD_REQUEST, mapped[0], mapped[1]);
      }
    }

    return this.database.transaction(async (client) => {
      let room: RoomRow | null = null;
      if (meetingType === "ROOM") {
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [
          dto.roomId,
        ]);
        const roomResult = await client.query<RoomRow>(
          `
            select id, name, floor, capacity, work_start::text, work_end::text,
              working_days, image_path, image_url, active
            from rooms where id = $1
          `,
          [dto.roomId],
        );
        room = roomResult.rows[0] ?? null;
        if (!room || !room.active) {
          throw apiError(
            HttpStatus.NOT_FOUND,
            "ROOM_NOT_FOUND",
            "Room was not found",
          );
        }
      }

      await this.assertCanCreate(client, user.id, room?.id);
      const overrideReason =
        meetingType === "ROOM" ? dto.overrideReason?.trim() : undefined;
      if (room && participantIds.length + 1 > room.capacity) {
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
      await this.bookingAttendees.lock(client, [user.id, ...participantIds]);
      await this.bookingAttendees.assertAvailable(
        client,
        [user.id, ...participantIds],
        occurrences,
      );

      const seriesId = recurrence === "NONE" ? null : randomUUID();
      if (seriesId) {
        await client.query(
          `
            insert into booking_series (
              id, organizer_id, room_id, frequency, recurrence_interval,
              weekdays, starts_at, ends_at, recurrence_until, timezone,
              meeting_type, meeting_url
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            seriesId,
            user.id,
            room?.id ?? null,
            recurrence,
            recurrenceInterval,
            weekdays,
            startsAt,
            endsAt,
            dto.recurrenceUntil!.slice(0, 10),
            recurrenceTimeZone,
            meetingType,
            meetingUrl,
          ],
        );
      }

      const bookingIds: string[] = [];
      for (const [occurrenceIndex, occurrence] of occurrences.entries()) {
        const ruleError = room
          ? validateBookingRules({
              startsAt: occurrence.startsAt,
              endsAt: occurrence.endsAt,
              now: new Date(),
              officeTimeZone: this.officeTimeZone,
              workStart: room.work_start,
              workEnd: room.work_end,
              workingDays: room.working_days,
            })
          : validateMeetingRules({
              startsAt: occurrence.startsAt,
              endsAt: occurrence.endsAt,
              now: new Date(),
              officeTimeZone: this.officeTimeZone,
            });
        if (
          ruleError &&
          !(
            user.role === "ADMIN" &&
            (ruleError === "OUTSIDE_WORKING_HOURS" ||
              ruleError === "OUTSIDE_WORKING_DAYS") &&
            overrideReason
          )
        ) {
          throw this.ruleException(ruleError);
        }

        if (room) {
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
            [room.id, occurrence.startsAt, occurrence.endsAt],
          );
          if (block.rowCount && !(user.role === "ADMIN" && overrideReason)) {
            throw apiError(
              HttpStatus.CONFLICT,
              "ROOM_UNAVAILABLE",
              "Room is unavailable during one of the requested events",
              { startsAt: occurrence.startsAt },
            );
          }
        }

        const bookingId = randomUUID();
        try {
          await client.query(
            `
              insert into bookings (
                id, room_id, organizer_id, title, starts_at, ends_at,
                participation_mode, override_reason, series_id,
                occurrence_index, meeting_type, meeting_url
              )
              values (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
              )
            `,
            [
              bookingId,
              room?.id ?? null,
              user.id,
              title,
              occurrence.startsAt,
              occurrence.endsAt,
              dto.participationMode ?? "INVITE_ONLY",
              overrideReason || null,
              seriesId,
              seriesId ? occurrenceIndex : null,
              meetingType,
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
              "One of the requested time slots is already booked",
              { startsAt: occurrence.startsAt },
            );
          }
          throw error;
        }
        bookingIds.push(bookingId);

        for (const participant of participants) {
          await client.query(
            `
              insert into booking_participants (booking_id, user_id, status)
              values ($1, $2, 'INVITED')
            `,
            [bookingId, participant.id],
          );
          const invitation = bookingInvitationCopy(
            user.name,
            title,
            room?.name ?? null,
            occurrence.startsAt,
            participant,
            this.officeTimeZone,
          );
          await this.notifications.enqueue(client, {
            eventKey: `booking:${bookingId}:invite:${participant.id}`,
            userId: participant.id,
            type: "BOOKING_INVITATION",
            category: "INVITATIONS",
            title: invitation.title,
            body: invitation.body,
            bookingId,
          });
        }

        if (overrideReason) {
          await client.query(
            `
              insert into audit_logs
                (id, actor_id, action, target_type, target_id, details)
              values ($1, $2, 'BOOKING_AVAILABILITY_OVERRIDE', 'BOOKING', $3, $4)
            `,
            [
              randomUUID(),
              user.id,
              bookingId,
              JSON.stringify({ reason: overrideReason, seriesId }),
            ],
          );
        }

        await recordActivity(
          client,
          user.id,
          "BOOKING_CREATED",
          "BOOKING",
          bookingId,
          {
            title,
            roomName: room?.name ?? null,
            meetingType,
            meetingUrl,
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            participationMode: dto.participationMode ?? "INVITE_ONLY",
            participantCount: participants.length,
            seriesId,
            occurrenceIndex: seriesId ? occurrenceIndex : null,
          },
        );
      }

      return {
        id: bookingIds[0],
        seriesId,
        occurrenceCount: bookingIds.length,
      };
    });
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

  async saveImage(
    user: CurrentUser,
    bookingId: string,
    file: Express.Multer.File,
  ) {
    return this.bookingImages.save(user, bookingId, file);
  }

  async removeImage(user: CurrentUser, bookingId: string): Promise<void> {
    await this.bookingImages.remove(user, bookingId);
  }

  private async assertCanCreate(
    client: PoolClient,
    userId: string,
    roomId?: string,
  ): Promise<void> {
    await this.accessPolicies.assertAllowed(
      client,
      userId,
      "BOOKING_CREATE",
      roomId,
    );
  }

  private ruleException(code: BookingRuleError) {
    return apiError(HttpStatus.BAD_REQUEST, code, bookingRuleMessage(code));
  }
}
