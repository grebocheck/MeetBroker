import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AccessPoliciesService } from "../access-policies/access-policies.service";
import { apiError } from "../common/http-error";
import { DatabaseService } from "../database/database.service";

interface ScheduleRoomRow {
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
export class BookingQueriesService {
  private readonly officeTimeZone: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly accessPolicies: AccessPoliciesService,
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
    const { from, to } = this.validatedRange(
      fromRaw,
      toRaw,
      "Schedule range is invalid",
    );
    await this.accessPolicies.assertAllowed(
      this.database,
      userId,
      "SCHEDULE_VIEW",
      roomId,
    );

    const room = await this.database.query<ScheduleRoomRow>(
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
    const { from, to } = this.validatedRange(
      fromRaw,
      toRaw,
      "Calendar range is invalid",
    );
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

  private validatedRange(
    fromRaw: string,
    toRaw: string,
    message: string,
  ): { from: Date; to: Date } {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 32 * 24 * 60 * 60 * 1000
    ) {
      throw apiError(HttpStatus.BAD_REQUEST, "INVALID_RANGE", message);
    }
    return { from, to };
  }
}
