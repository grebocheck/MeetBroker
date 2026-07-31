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

interface ParticipantRow {
  id: string;
  name: string;
  locale: Locale;
  timezone: string | null;
}

interface AttendeeConflictRow {
  user_id: string;
  user_name: string;
  booking_id: string;
  booking_title: string;
  starts_at: Date;
  ends_at: Date;
  requested_start: Date;
  relation: "ORGANIZER" | "PARTICIPANT";
}

@Injectable()
export class BookingsService {
  private readonly officeTimeZone: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly accessPolicies: AccessPoliciesService,
    private readonly bookingImages: BookingImagesService,
    config: ConfigService,
  ) {
    this.officeTimeZone =
      config.get<string>("OFFICE_TIMEZONE") ?? "Europe/Kyiv";
  }

  async schedule(
    userId: string,
    roomId: string,
    fromRaw: string,
    toRaw: string,
  ) {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 32 * 24 * 60 * 60 * 1000
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_RANGE",
        "Schedule range is invalid",
      );
    }
    await this.accessPolicies.assertAllowed(
      this.database,
      userId,
      "SCHEDULE_VIEW",
      roomId,
    );

    const room = await this.database.query<RoomRow>(
      `
        select
          id,
          name,
          floor,
          capacity,
          work_start::text,
          work_end::text,
          working_days,
          image_path,
          image_url,
          active
        from rooms where id = $1
      `,
      [roomId],
    );
    if (!room.rows[0] || !room.rows[0].active) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "ROOM_NOT_FOUND",
        "Room was not found",
      );
    }

    const bookings = await this.database.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      participation_mode: "INVITE_ONLY" | "OPEN";
      series_id: string | null;
      organizer_id: string;
      organizer_name: string;
      organizer_avatar_preset: string;
      organizer_avatar_path: string | null;
      image_path: string | null;
      participants: unknown;
    }>(
      `
        select
          b.id,
          b.title,
          b.starts_at,
          b.ends_at,
          b.participation_mode,
          b.series_id,
          u.id as organizer_id,
          u.name as organizer_name,
          u.avatar_preset as organizer_avatar_preset,
          u.avatar_path as organizer_avatar_path,
          b.image_path,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'status', bp.status,
                'avatarPreset', p.avatar_preset,
                'avatarUrl', case when p.avatar_path is null
                  then null else '/uploads/' || p.avatar_path end
              )
            ) filter (where p.id is not null),
            '[]'::jsonb
          ) as participants
        from bookings b
        join users u on u.id = b.organizer_id
        left join booking_participants bp on bp.booking_id = b.id
        left join users p on p.id = bp.user_id
        where b.room_id = $1
          and b.cancelled_at is null
          and b.starts_at < $3
          and b.ends_at > $2
        group by b.id, u.id
        order by b.starts_at
      `,
      [roomId, from, to],
    );

    const blocks = await this.database.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      series_id: string | null;
      frequency: "DAILY" | "WEEKLY" | null;
      recurrence_interval: number | null;
      weekdays: number[] | null;
      recurrence_until: Date | string | null;
    }>(
      `
        select
          rb.id,
          rb.title,
          rb.starts_at,
          rb.ends_at,
          rb.series_id,
          s.frequency,
          s.recurrence_interval,
          s.weekdays,
          s.recurrence_until
        from room_blocks rb
        left join room_block_series s on s.id = rb.series_id
        where rb.room_id = $1
          and rb.cancelled_at is null
          and rb.starts_at < $3
          and rb.ends_at > $2
        order by rb.starts_at
      `,
      [roomId, from, to],
    );

    return {
      officeTimeZone: this.officeTimeZone,
      room: {
        id: room.rows[0].id,
        name: room.rows[0].name,
        floor: room.rows[0].floor,
        capacity: room.rows[0].capacity,
        workStart: room.rows[0].work_start.slice(0, 5),
        workEnd: room.rows[0].work_end.slice(0, 5),
        workingDays: room.rows[0].working_days,
        imageUrl: room.rows[0].image_path
          ? `/uploads/${room.rows[0].image_path}`
          : room.rows[0].image_url,
      },
      bookings: bookings.rows.map((booking) => ({
        id: booking.id,
        title: booking.title,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        participationMode: booking.participation_mode,
        seriesId: booking.series_id,
        imageUrl: booking.image_path ? `/uploads/${booking.image_path}` : null,
        organizer: {
          id: booking.organizer_id,
          name: booking.organizer_name,
          avatarPreset: booking.organizer_avatar_preset,
          avatarUrl: booking.organizer_avatar_path
            ? `/uploads/${booking.organizer_avatar_path}`
            : null,
        },
        participants: booking.participants,
      })),
      blocks: blocks.rows.map((block) => ({
        id: block.id,
        title: block.title,
        startsAt: block.starts_at,
        endsAt: block.ends_at,
        seriesId: block.series_id,
        recurrence: block.frequency,
        recurrenceInterval: block.recurrence_interval,
        recurrenceWeekdays: block.weekdays,
        recurrenceUntil:
          block.recurrence_until instanceof Date
            ? block.recurrence_until.toISOString().slice(0, 10)
            : (block.recurrence_until?.slice(0, 10) ?? null),
      })),
    };
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
      const participants = await this.loadParticipants(client, participantIds);
      if (participants.length !== participantIds.length) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "INVALID_PARTICIPANT",
          "One or more participants are unavailable",
        );
      }
      await this.lockAttendees(client, [user.id, ...participantIds]);
      await this.assertAttendeesAvailable(
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

      const participants = await this.loadParticipants(client, participantIds);
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
      await this.lockAttendees(client, [
        booking.organizer_id,
        ...busyParticipantIds,
      ]);
      await this.assertAttendeesAvailable(
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

  async mine(userId: string, section: "future" | "past", offset: number) {
    const pageSize = 30;
    const safeOffset = Math.max(offset, 0);
    const direction = section === "future" ? "asc" : "desc";
    const comparison = section === "future" ? ">=" : "<";
    const result = await this.database.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      meeting_type: "ROOM" | "ONLINE";
      meeting_url: string | null;
      image_path: string | null;
      room_id: string | null;
      room_name: string | null;
      organizer_id: string;
      participation_mode: string;
      series_id: string | null;
      participant_status: string | null;
    }>(
      `
        select
          b.id,
          b.title,
          b.starts_at,
          b.ends_at,
          b.meeting_type,
          b.meeting_url,
          b.image_path,
          r.id as room_id,
          r.name as room_name,
          b.organizer_id,
          b.participation_mode,
          b.series_id,
          bp.status as participant_status
        from bookings b
        left join rooms r on r.id = b.room_id
        left join booking_participants bp
          on bp.booking_id = b.id and bp.user_id = $1
        where b.cancelled_at is null
          and (b.organizer_id = $1 or bp.user_id = $1)
          and b.starts_at ${comparison} now()
        order by b.starts_at ${direction}
        limit $3 offset $2
      `,
      [userId, safeOffset, pageSize + 1],
    );
    const hasMore = result.rows.length > pageSize;
    const bookings = result.rows.slice(0, pageSize).map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      meetingType: row.meeting_type,
      meetingUrl: row.meeting_url,
      imageUrl: row.image_path ? `/uploads/${row.image_path}` : null,
      room: row.room_id ? { id: row.room_id, name: row.room_name } : null,
      organizerId: row.organizer_id,
      participationMode: row.participation_mode,
      seriesId: row.series_id,
      participantStatus: row.participant_status,
    }));
    return {
      bookings,
      hasMore,
      nextOffset: hasMore ? safeOffset + pageSize : null,
    };
  }

  async myCalendar(userId: string, fromRaw: string, toRaw: string) {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 32 * 24 * 60 * 60 * 1000
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_RANGE",
        "Calendar range is invalid",
      );
    }
    await this.accessPolicies.assertAllowed(
      this.database,
      userId,
      "SCHEDULE_VIEW",
    );
    const result = await this.database.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      meeting_type: "ROOM" | "ONLINE";
      meeting_url: string | null;
      image_path: string | null;
      room_id: string | null;
      room_name: string | null;
      organizer_id: string;
      organizer_name: string;
      organizer_avatar_preset: string;
      organizer_avatar_path: string | null;
      participation_mode: "INVITE_ONLY" | "OPEN";
      series_id: string | null;
      participant_status: "INVITED" | "ACCEPTED" | null;
      participants: unknown;
    }>(
      `
        select
          b.id,
          b.title,
          b.starts_at,
          b.ends_at,
          b.meeting_type,
          b.meeting_url,
          b.image_path,
          r.id as room_id,
          r.name as room_name,
          organizer.id as organizer_id,
          organizer.name as organizer_name,
          organizer.avatar_preset as organizer_avatar_preset,
          organizer.avatar_path as organizer_avatar_path,
          b.participation_mode,
          b.series_id,
          mine.status as participant_status,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', participant.id,
                'name', participant.name,
                'status', all_participants.status,
                'avatarPreset', participant.avatar_preset,
                'avatarUrl', case when participant.avatar_path is null
                  then null else '/uploads/' || participant.avatar_path end
              )
            ) filter (where participant.id is not null),
            '[]'::jsonb
          ) as participants
        from bookings b
        join users organizer on organizer.id = b.organizer_id
        left join rooms r on r.id = b.room_id
        left join booking_participants mine
          on mine.booking_id = b.id and mine.user_id = $1
        left join booking_participants all_participants
          on all_participants.booking_id = b.id
        left join users participant
          on participant.id = all_participants.user_id
        where b.cancelled_at is null
          and b.starts_at < $3
          and b.ends_at > $2
          and (
            b.organizer_id = $1
            or mine.status in ('INVITED', 'ACCEPTED')
          )
        group by b.id, r.id, organizer.id, mine.status
        order by b.starts_at
      `,
      [userId, from, to],
    );
    return {
      officeTimeZone: this.officeTimeZone,
      meetings: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        meetingType: row.meeting_type,
        meetingUrl: row.meeting_url,
        imageUrl: row.image_path ? `/uploads/${row.image_path}` : null,
        room: row.room_id ? { id: row.room_id, name: row.room_name } : null,
        participationMode: row.participation_mode,
        seriesId: row.series_id,
        organizer: {
          id: row.organizer_id,
          name: row.organizer_name,
          avatarPreset: row.organizer_avatar_preset,
          avatarUrl: row.organizer_avatar_path
            ? `/uploads/${row.organizer_avatar_path}`
            : null,
        },
        participants: row.participants,
        myRole: row.organizer_id === userId ? "ORGANIZER" : "PARTICIPANT",
        participantStatus: row.participant_status,
      })),
    };
  }

  async openEvents(userId: string) {
    const result = await this.database.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      meeting_type: "ROOM" | "ONLINE";
      meeting_url: string | null;
      image_path: string | null;
      room_id: string | null;
      room_name: string | null;
      capacity: number;
      organizer_id: string;
      organizer_name: string;
      series_id: string | null;
      participant_count: string;
      my_status: string | null;
    }>(
      `
        select
          b.id,
          b.title,
          b.starts_at,
          b.ends_at,
          b.meeting_type,
          b.meeting_url,
          b.image_path,
          r.id as room_id,
          r.name as room_name,
          coalesce(r.capacity, 51) as capacity,
          u.id as organizer_id,
          u.name as organizer_name,
          b.series_id,
          count(bp.user_id) filter (where bp.status = 'ACCEPTED')::text
            as participant_count,
          max(bp.status) filter (where bp.user_id = $1) as my_status
        from bookings b
        left join rooms r on r.id = b.room_id
        join users u on u.id = b.organizer_id
        left join booking_participants bp on bp.booking_id = b.id
        where b.participation_mode = 'OPEN'
          and b.cancelled_at is null
          and b.starts_at > now()
        group by b.id, r.id, u.id
        order by b.starts_at
        limit 100
      `,
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      meetingType: row.meeting_type,
      meetingUrl:
        row.organizer_id === userId || row.my_status === "ACCEPTED"
          ? row.meeting_url
          : null,
      imageUrl: row.image_path ? `/uploads/${row.image_path}` : null,
      room: row.room_id
        ? {
            id: row.room_id,
            name: row.room_name,
            capacity: row.capacity,
          }
        : null,
      organizer: { id: row.organizer_id, name: row.organizer_name },
      seriesId: row.series_id,
      participantCount: Number(row.participant_count) + 1,
      myStatus: row.my_status,
    }));
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
        await this.lockAttendees(client, [userId]);
        await this.assertAttendeesAvailable(client, [userId], invitation.rows, [
          bookingId,
        ]);
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

  async joinOpenEvent(userId: string, bookingId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        bookingId,
      ]);
      const result = await client.query<{
        capacity: number;
        participant_count: string;
        organizer_id: string;
      }>(
        `
          select
            coalesce(r.capacity, 51) as capacity,
            b.organizer_id,
            count(bp.user_id) filter (where bp.status = 'ACCEPTED')::text
              as participant_count
          from bookings b
          left join rooms r on r.id = b.room_id
          left join booking_participants bp on bp.booking_id = b.id
          where b.id = $1
            and b.participation_mode = 'OPEN'
            and b.cancelled_at is null
            and b.starts_at > now()
          group by b.id, r.id
        `,
        [bookingId],
      );
      const event = result.rows[0];
      if (!event) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "OPEN_EVENT_NOT_FOUND",
          "Open event was not found",
        );
      }
      if (event.organizer_id === userId) return;
      if (Number(event.participant_count) + 1 >= event.capacity) {
        throw apiError(HttpStatus.CONFLICT, "EVENT_FULL", "This event is full");
      }
      const interval = await client.query<{
        starts_at: Date;
        ends_at: Date;
      }>(
        `
          select starts_at, ends_at
          from bookings
          where id = $1
        `,
        [bookingId],
      );
      await this.lockAttendees(client, [userId]);
      await this.assertAttendeesAvailable(client, [userId], interval.rows, [
        bookingId,
      ]);
      await client.query(
        `
          insert into booking_participants
            (booking_id, user_id, status, responded_at)
          values ($1, $2, 'ACCEPTED', now())
          on conflict (booking_id, user_id)
          do update set status = 'ACCEPTED', responded_at = now()
        `,
        [bookingId, userId],
      );
      await recordActivity(
        client,
        userId,
        "OPEN_EVENT_JOINED",
        "BOOKING",
        bookingId,
      );
    });
  }

  async leaveOpenEvent(userId: string, bookingId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const result = await client.query(
        `
          delete from booking_participants bp
          using bookings b
          where bp.booking_id = $1
            and bp.user_id = $2
            and b.id = bp.booking_id
            and b.participation_mode = 'OPEN'
        `,
        [bookingId, userId],
      );
      if (result.rowCount) {
        await recordActivity(
          client,
          userId,
          "OPEN_EVENT_LEFT",
          "BOOKING",
          bookingId,
        );
      }
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

  private async lockAttendees(
    client: PoolClient,
    userIds: string[],
  ): Promise<void> {
    const sortedIds = [...new Set(userIds)].sort();
    for (const userId of sortedIds) {
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [userId],
      );
    }
  }

  private async assertAttendeesAvailable(
    client: PoolClient,
    userIds: string[],
    occurrences: Array<{
      startsAt?: Date;
      endsAt?: Date;
      starts_at?: Date;
      ends_at?: Date;
    }>,
    excludedBookingIds: string[] = [],
  ): Promise<void> {
    const requested = occurrences.map((occurrence) => ({
      starts_at: (occurrence.startsAt ?? occurrence.starts_at)!.toISOString(),
      ends_at: (occurrence.endsAt ?? occurrence.ends_at)!.toISOString(),
    }));
    if (!userIds.length || !requested.length) return;

    const result = await client.query<AttendeeConflictRow>(
      `
        with attendee_ids as (
          select distinct unnest($1::uuid[]) as user_id
        ),
        requested as (
          select starts_at, ends_at
          from jsonb_to_recordset($2::jsonb)
            as intervals(starts_at timestamptz, ends_at timestamptz)
        )
        select distinct
          u.id as user_id,
          u.name as user_name,
          b.id as booking_id,
          b.title as booking_title,
          b.starts_at,
          b.ends_at,
          requested.starts_at as requested_start,
          case
            when b.organizer_id = u.id then 'ORGANIZER'
            else 'PARTICIPANT'
          end as relation
        from attendee_ids attendee
        join users u on u.id = attendee.user_id
        join bookings b
          on b.cancelled_at is null
          and (
            b.organizer_id = u.id
            or exists (
              select 1
              from booking_participants bp
              where bp.booking_id = b.id
                and bp.user_id = u.id
                and bp.status in ('INVITED', 'ACCEPTED')
            )
          )
        join requested
          on b.starts_at < requested.ends_at
          and b.ends_at > requested.starts_at
        where not (b.id = any($3::uuid[]))
        order by u.name, b.starts_at, b.id
      `,
      [[...new Set(userIds)], JSON.stringify(requested), excludedBookingIds],
    );
    if (!result.rowCount) return;

    const grouped = new Map<
      string,
      {
        userId: string;
        userName: string;
        bookings: Array<{
          id: string;
          title: string;
          startsAt: Date;
          endsAt: Date;
          requestedStart: Date;
          relation: "ORGANIZER" | "PARTICIPANT";
        }>;
      }
    >();
    for (const row of result.rows) {
      const conflict = grouped.get(row.user_id) ?? {
        userId: row.user_id,
        userName: row.user_name,
        bookings: [],
      };
      conflict.bookings.push({
        id: row.booking_id,
        title: row.booking_title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        requestedStart: row.requested_start,
        relation: row.relation,
      });
      grouped.set(row.user_id, conflict);
    }
    throw apiError(
      HttpStatus.CONFLICT,
      "ATTENDEE_BUSY",
      "One or more attendees already have overlapping meetings",
      { conflicts: [...grouped.values()] },
    );
  }

  private async loadParticipants(
    client: PoolClient,
    ids: string[],
  ): Promise<ParticipantRow[]> {
    if (!ids.length) return [];
    const result = await client.query<ParticipantRow>(
      `
        select id, name, locale, timezone
        from users
        where id = any($1::uuid[])
          and email_verified_at is not null
          and approved_at is not null
          and access_revoked_at is null
      `,
      [ids],
    );
    return result.rows;
  }

  private ruleException(code: BookingRuleError) {
    return apiError(HttpStatus.BAD_REQUEST, code, bookingRuleMessage(code));
  }
}
