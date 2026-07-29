import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import type { CurrentUser } from "../common/types";
import { NotificationsService } from "../notifications/notifications.service";
import type {
  CancelBookingDto,
  CreateBookingDto,
  RespondToInvitationDto,
  UpdateBookingDto
} from "./bookings.dto";
import {
  BookingRuleError,
  validateBookingRules
} from "./booking-rules";

interface RoomRow {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  work_start: string;
  work_end: string;
  image_path: string | null;
  image_url: string | null;
  active: boolean;
}

interface ParticipantRow {
  id: string;
  name: string;
  locale: "uk" | "en";
  timezone: string | null;
}

@Injectable()
export class BookingsService {
  private readonly officeTimeZone: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    config: ConfigService
  ) {
    this.officeTimeZone =
      config.get<string>("OFFICE_TIMEZONE") ?? "Europe/Kyiv";
  }

  async schedule(roomId: string, fromRaw: string, toRaw: string) {
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
        "Schedule range is invalid"
      );
    }

    const room = await this.database.query<RoomRow>(
      `
        select
          id,
          name,
          floor,
          capacity,
          work_start::text,
          work_end::text,
          image_path,
          image_url,
          active
        from rooms where id = $1
      `,
      [roomId]
    );
    if (!room.rows[0] || !room.rows[0].active) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "ROOM_NOT_FOUND",
        "Room was not found"
      );
    }

    const bookings = await this.database.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      participation_mode: "INVITE_ONLY" | "OPEN";
      organizer_id: string;
      organizer_name: string;
      organizer_avatar_preset: string;
      organizer_avatar_path: string | null;
      participants: unknown;
    }>(
      `
        select
          b.id,
          b.title,
          b.starts_at,
          b.ends_at,
          b.participation_mode,
          u.id as organizer_id,
          u.name as organizer_name,
          u.avatar_preset as organizer_avatar_preset,
          u.avatar_path as organizer_avatar_path,
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
      [roomId, from, to]
    );

    const blocks = await this.database.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
    }>(
      `
        select id, title, starts_at, ends_at
        from room_blocks
        where room_id = $1
          and cancelled_at is null
          and starts_at < $3
          and ends_at > $2
        order by starts_at
      `,
      [roomId, from, to]
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
        imageUrl: room.rows[0].image_path
          ? `/uploads/${room.rows[0].image_path}`
          : room.rows[0].image_url
      },
      bookings: bookings.rows.map((booking) => ({
        id: booking.id,
        title: booking.title,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        participationMode: booking.participation_mode,
        organizer: {
          id: booking.organizer_id,
          name: booking.organizer_name,
          avatarPreset: booking.organizer_avatar_preset,
          avatarUrl: booking.organizer_avatar_path
            ? `/uploads/${booking.organizer_avatar_path}`
            : null
        },
        participants: booking.participants
      })),
      blocks: blocks.rows.map((block) => ({
        id: block.id,
        title: block.title,
        startsAt: block.starts_at,
        endsAt: block.ends_at
      }))
    };
  }

  async create(user: CurrentUser, dto: CreateBookingDto) {
    const title = dto.title.trim();
    if (!title) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "TITLE_REQUIRED",
        "Booking title is required"
      );
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const participantIds = [
      ...new Set((dto.participantIds ?? []).filter((id) => id !== user.id))
    ];

    return this.database.transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        dto.roomId
      ]);
      const roomResult = await client.query<RoomRow>(
        `
          select id, name, floor, capacity, work_start::text, work_end::text, active
          from rooms where id = $1
        `,
        [dto.roomId]
      );
      const room = roomResult.rows[0];
      if (!room || !room.active) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "ROOM_NOT_FOUND",
          "Room was not found"
        );
      }

      await this.assertCanCreate(client, user.id, room.id);
      const ruleError = validateBookingRules({
        startsAt,
        endsAt,
        now: new Date(),
        officeTimeZone: this.officeTimeZone,
        workStart: room.work_start,
        workEnd: room.work_end
      });
      const overrideReason = dto.overrideReason?.trim();
      if (
        ruleError &&
        !(
          user.role === "ADMIN" &&
          ruleError === "OUTSIDE_WORKING_HOURS" &&
          overrideReason
        )
      ) {
        throw this.ruleException(ruleError);
      }

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
        [room.id, startsAt, endsAt]
      );
      if (
        block.rowCount &&
        !(user.role === "ADMIN" && overrideReason)
      ) {
        throw apiError(
          HttpStatus.CONFLICT,
          "ROOM_UNAVAILABLE",
          "Room is unavailable during this time"
        );
      }

      if (participantIds.length + 1 > room.capacity) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "ROOM_CAPACITY_EXCEEDED",
          "Number of participants exceeds room capacity"
        );
      }
      const participants = await this.loadParticipants(
        client,
        participantIds
      );
      if (participants.length !== participantIds.length) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "INVALID_PARTICIPANT",
          "One or more participants are unavailable"
        );
      }

      const bookingId = randomUUID();
      try {
        await client.query(
          `
            insert into bookings (
              id, room_id, organizer_id, title, starts_at, ends_at,
              participation_mode, override_reason
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            bookingId,
            room.id,
            user.id,
            title,
            startsAt,
            endsAt,
            dto.participationMode ?? "INVITE_ONLY",
            overrideReason || null
          ]
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
            "This time slot is already booked"
          );
        }
        throw error;
      }

      for (const participant of participants) {
        await client.query(
          `
            insert into booking_participants (booking_id, user_id, status)
            values ($1, $2, 'INVITED')
          `,
          [bookingId, participant.id]
        );
        const invitation = this.invitationCopy(
          user.name,
          title,
          room.name,
          startsAt,
          participant
        );
        await this.notifications.enqueue(client, {
          eventKey: `booking:${bookingId}:invite:${participant.id}`,
          userId: participant.id,
          type: "BOOKING_INVITATION",
          category: "INVITATIONS",
          title: invitation.title,
          body: invitation.body,
          bookingId
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
            JSON.stringify({ reason: overrideReason })
          ]
        );
      }

      return { id: bookingId };
    });
  }

  async update(
    user: CurrentUser,
    bookingId: string,
    dto: UpdateBookingDto
  ): Promise<void> {
    const title = dto.title.trim();
    if (!title) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "TITLE_REQUIRED",
        "Booking title is required"
      );
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const participantIds = [
      ...new Set(dto.participantIds.filter((id) => id !== user.id))
    ];

    await this.database.transaction(async (client) => {
      const bookingResult = await client.query<{
        id: string;
        title: string;
        starts_at: Date;
        ends_at: Date;
        participation_mode: "INVITE_ONLY" | "OPEN";
        organizer_id: string;
        cancelled_at: Date | null;
        room_id: string;
        room_name: string;
        capacity: number;
        work_start: string;
        work_end: string;
        active: boolean;
      }>(
        `
          select
            b.id,
            b.title,
            b.starts_at,
            b.ends_at,
            b.participation_mode,
            b.organizer_id,
            b.cancelled_at,
            r.id as room_id,
            r.name as room_name,
            r.capacity,
            r.work_start::text,
            r.work_end::text,
            r.active
          from bookings b
          join rooms r on r.id = b.room_id
          where b.id = $1
          for update of b
        `,
        [bookingId]
      );
      const booking = bookingResult.rows[0];
      if (!booking || booking.cancelled_at || !booking.active) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "BOOKING_NOT_FOUND",
          "Booking was not found"
        );
      }
      if (booking.organizer_id !== user.id) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          "NOT_BOOKING_OWNER",
          "Only the organizer can edit this booking"
        );
      }

      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        booking.room_id
      ]);
      const ruleError = validateBookingRules({
        startsAt,
        endsAt,
        now: new Date(),
        officeTimeZone: this.officeTimeZone,
        workStart: booking.work_start,
        workEnd: booking.work_end
      });
      if (ruleError) throw this.ruleException(ruleError);

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
        [booking.room_id, startsAt, endsAt]
      );
      if (block.rowCount) {
        throw apiError(
          HttpStatus.CONFLICT,
          "ROOM_UNAVAILABLE",
          "Room is unavailable during this time"
        );
      }
      if (participantIds.length + 1 > booking.capacity) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "ROOM_CAPACITY_EXCEEDED",
          "Number of participants exceeds room capacity"
        );
      }

      const participants = await this.loadParticipants(client, participantIds);
      if (participants.length !== participantIds.length) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "INVALID_PARTICIPANT",
          "One or more participants are unavailable"
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
        [bookingId]
      );
      const currentIds = new Set(
        currentParticipants.rows.map((participant) => participant.id)
      );
      const nextIds = new Set(participantIds);
      const added = participants.filter(
        (participant) => !currentIds.has(participant.id)
      );
      const retained = participants.filter((participant) =>
        currentIds.has(participant.id)
      );
      const removed = currentParticipants.rows.filter(
        (participant) => !nextIds.has(participant.id)
      );
      const detailsChanged =
        booking.title !== title ||
        booking.starts_at.getTime() !== startsAt.getTime() ||
        booking.ends_at.getTime() !== endsAt.getTime() ||
        booking.participation_mode !== dto.participationMode;
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
              updated_at = now()
            where id = $1
          `,
          [bookingId, title, startsAt, endsAt, dto.participationMode]
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
            "This time slot is already booked"
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
          [bookingId, removed.map((participant) => participant.id)]
        );
      }
      for (const participant of added) {
        await client.query(
          `
            insert into booking_participants (booking_id, user_id, status)
            values ($1, $2, 'INVITED')
          `,
          [bookingId, participant.id]
        );
      }

      const editId = randomUUID();
      for (const participant of retained) {
        const copy = this.changeCopy(
          title,
          booking.room_name,
          startsAt,
          participant
        );
        await this.notifications.enqueue(client, {
          eventKey: `booking:${bookingId}:update:${editId}:${participant.id}`,
          userId: participant.id,
          type: "BOOKING_UPDATED",
          category: "CHANGES",
          title: copy.title,
          body: copy.body,
          bookingId
        });
      }
      for (const participant of removed) {
        const copy = this.removalCopy(title, participant);
        await this.notifications.enqueue(client, {
          eventKey: `booking:${bookingId}:removed:${editId}:${participant.id}`,
          userId: participant.id,
          type: "BOOKING_PARTICIPANT_REMOVED",
          category: "CHANGES",
          title: copy.title,
          body: copy.body,
          bookingId
        });
      }
      for (const participant of added) {
        const copy = this.invitationCopy(
          user.name,
          title,
          booking.room_name,
          startsAt,
          participant
        );
        await this.notifications.enqueue(client, {
          eventKey: `booking:${bookingId}:invite:${editId}:${participant.id}`,
          userId: participant.id,
          type: "BOOKING_INVITATION",
          category: "INVITATIONS",
          title: copy.title,
          body: copy.body,
          bookingId
        });
      }
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
      room_id: string;
      room_name: string;
      organizer_id: string;
      participation_mode: string;
      participant_status: string | null;
    }>(
      `
        select
          b.id,
          b.title,
          b.starts_at,
          b.ends_at,
          r.id as room_id,
          r.name as room_name,
          b.organizer_id,
          b.participation_mode,
          bp.status as participant_status
        from bookings b
        join rooms r on r.id = b.room_id
        left join booking_participants bp
          on bp.booking_id = b.id and bp.user_id = $1
        where b.cancelled_at is null
          and (b.organizer_id = $1 or bp.user_id = $1)
          and b.starts_at ${comparison} now()
        order by b.starts_at ${direction}
        limit $3 offset $2
      `,
      [userId, safeOffset, pageSize + 1]
    );
    const hasMore = result.rows.length > pageSize;
    const bookings = result.rows.slice(0, pageSize).map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      room: { id: row.room_id, name: row.room_name },
      organizerId: row.organizer_id,
      participationMode: row.participation_mode,
      participantStatus: row.participant_status
    }));
    return {
      bookings,
      hasMore,
      nextOffset: hasMore ? safeOffset + pageSize : null
    };
  }

  async openEvents(userId: string) {
    const result = await this.database.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      room_id: string;
      room_name: string;
      capacity: number;
      organizer_id: string;
      organizer_name: string;
      participant_count: string;
      my_status: string | null;
    }>(
      `
        select
          b.id,
          b.title,
          b.starts_at,
          b.ends_at,
          r.id as room_id,
          r.name as room_name,
          r.capacity,
          u.id as organizer_id,
          u.name as organizer_name,
          count(bp.user_id) filter (where bp.status = 'ACCEPTED')::text
            as participant_count,
          max(bp.status) filter (where bp.user_id = $1) as my_status
        from bookings b
        join rooms r on r.id = b.room_id
        join users u on u.id = b.organizer_id
        left join booking_participants bp on bp.booking_id = b.id
        where b.participation_mode = 'OPEN'
          and b.cancelled_at is null
          and b.starts_at > now()
        group by b.id, r.id, u.id
        order by b.starts_at
        limit 100
      `,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      room: {
        id: row.room_id,
        name: row.room_name,
        capacity: row.capacity
      },
      organizer: { id: row.organizer_id, name: row.organizer_name },
      participantCount: Number(row.participant_count) + 1,
      myStatus: row.my_status
    }));
  }

  async respond(
    userId: string,
    bookingId: string,
    dto: RespondToInvitationDto
  ): Promise<void> {
    const result = await this.database.query(
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
      [bookingId, userId, dto.status]
    );
    if (!result.rowCount) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "INVITATION_NOT_FOUND",
        "Active invitation was not found"
      );
    }
  }

  async joinOpenEvent(userId: string, bookingId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        bookingId
      ]);
      const result = await client.query<{
        capacity: number;
        participant_count: string;
        organizer_id: string;
      }>(
        `
          select
            r.capacity,
            b.organizer_id,
            count(bp.user_id) filter (where bp.status = 'ACCEPTED')::text
              as participant_count
          from bookings b
          join rooms r on r.id = b.room_id
          left join booking_participants bp on bp.booking_id = b.id
          where b.id = $1
            and b.participation_mode = 'OPEN'
            and b.cancelled_at is null
            and b.starts_at > now()
          group by b.id, r.id
        `,
        [bookingId]
      );
      const event = result.rows[0];
      if (!event) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "OPEN_EVENT_NOT_FOUND",
          "Open event was not found"
        );
      }
      if (event.organizer_id === userId) return;
      if (Number(event.participant_count) + 1 >= event.capacity) {
        throw apiError(
          HttpStatus.CONFLICT,
          "EVENT_FULL",
          "This event is full"
        );
      }
      await client.query(
        `
          insert into booking_participants
            (booking_id, user_id, status, responded_at)
          values ($1, $2, 'ACCEPTED', now())
          on conflict (booking_id, user_id)
          do update set status = 'ACCEPTED', responded_at = now()
        `,
        [bookingId, userId]
      );
    });
  }

  async leaveOpenEvent(userId: string, bookingId: string): Promise<void> {
    await this.database.query(
      `
        delete from booking_participants bp
        using bookings b
        where bp.booking_id = $1
          and bp.user_id = $2
          and b.id = bp.booking_id
          and b.participation_mode = 'OPEN'
      `,
      [bookingId, userId]
    );
  }

  async cancel(
    user: CurrentUser,
    bookingId: string,
    dto: CancelBookingDto
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const bookingResult = await client.query<{
        id: string;
        title: string;
        organizer_id: string;
        cancelled_at: Date | null;
      }>(
        "select id, title, organizer_id, cancelled_at from bookings where id = $1 for update",
        [bookingId]
      );
      const booking = bookingResult.rows[0];
      if (!booking || booking.cancelled_at) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "BOOKING_NOT_FOUND",
          "Booking was not found"
        );
      }
      if (booking.organizer_id !== user.id && user.role !== "ADMIN") {
        throw apiError(
          HttpStatus.FORBIDDEN,
          "NOT_BOOKING_OWNER",
          "Only the organizer can cancel this booking"
        );
      }
      if (user.role === "ADMIN" && booking.organizer_id !== user.id) {
        const reason = dto.reason?.trim();
        if (!reason) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            "CANCELLATION_REASON_REQUIRED",
            "Administrator must provide a cancellation reason"
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
            JSON.stringify({ reason })
          ]
        );
      }
      await client.query(
        `
          update bookings
          set cancelled_at = now(), cancelled_by = $2, updated_at = now()
          where id = $1
        `,
        [bookingId, user.id]
      );

      const participants = await client.query<{ user_id: string }>(
        "select user_id from booking_participants where booking_id = $1",
        [bookingId]
      );
      for (const participant of participants.rows) {
        await this.notifications.enqueue(client, {
          eventKey: `booking:${bookingId}:cancel:${participant.user_id}`,
          userId: participant.user_id,
          type: "BOOKING_CANCELLED",
          category: "CHANGES",
          title: "Зустріч скасовано",
          body: `Зустріч «${booking.title}» було скасовано.`,
          bookingId
        });
      }
    });
  }

  private async assertCanCreate(
    client: PoolClient,
    userId: string,
    roomId: string
  ): Promise<void> {
    const restriction = await client.query(
      `
        select id
        from user_restrictions
        where user_id = $1
          and capability = 'BOOKING_CREATE'
          and revoked_at is null
          and starts_at <= now()
          and (expires_at is null or expires_at > now())
          and (room_id is null or room_id = $2)
        limit 1
      `,
      [userId, roomId]
    );
    if (restriction.rowCount) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        "BOOKING_CREATE_RESTRICTED",
        "Creating bookings is temporarily restricted"
      );
    }
  }

  private async loadParticipants(
    client: PoolClient,
    ids: string[]
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
      [ids]
    );
    return result.rows;
  }

  private changeCopy(
    bookingTitle: string,
    roomName: string,
    startsAt: Date,
    participant: ParticipantRow
  ): { title: string; body: string } {
    const locale = participant.locale === "en" ? "en-GB" : "uk-UA";
    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: participant.timezone ?? this.officeTimeZone
    }).format(startsAt);
    if (participant.locale === "en") {
      return {
        title: "Meeting details changed",
        body: `“${bookingTitle}” is now scheduled in “${roomName}” on ${date}.`
      };
    }
    return {
      title: "Деталі зустрічі змінено",
      body: `Зустріч «${bookingTitle}» тепер запланована в кімнаті «${roomName}»: ${date}.`
    };
  }

  private removalCopy(
    bookingTitle: string,
    participant: ParticipantRow
  ): { title: string; body: string } {
    if (participant.locale === "en") {
      return {
        title: "Meeting participation changed",
        body: `You are no longer a participant of “${bookingTitle}”.`
      };
    }
    return {
      title: "Участь у зустрічі змінено",
      body: `Вас більше немає серед учасників зустрічі «${bookingTitle}».`
    };
  }

  private invitationCopy(
    organizer: string,
    bookingTitle: string,
    roomName: string,
    startsAt: Date,
    participant: ParticipantRow
  ): { title: string; body: string } {
    const locale = participant.locale === "en" ? "en-GB" : "uk-UA";
    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: participant.timezone ?? this.officeTimeZone
    }).format(startsAt);
    if (participant.locale === "en") {
      return {
        title: "New meeting invitation",
        body: `${organizer} invited you to “${bookingTitle}” in “${roomName}” on ${date}.`
      };
    }
    return {
      title: "Нове запрошення",
      body: `${organizer} запрошує вас на зустріч «${bookingTitle}» у кімнаті «${roomName}»: ${date}.`
    };
  }

  private ruleException(code: BookingRuleError) {
    const messages: Record<BookingRuleError, string> = {
      INVALID_TIME: "Start and end time are invalid",
      SLOT_ALIGNMENT: "Time must align to a 30-minute slot",
      DURATION: "Booking duration must be between 30 minutes and 4 hours",
      PAST: "Booking must start in the future",
      OUTSIDE_WORKING_HOURS: "Booking is outside room working hours"
    };
    return apiError(HttpStatus.BAD_REQUEST, code, messages[code]);
  }
}
