import { HttpStatus, Injectable } from "@nestjs/common";
import { apiError } from "../common/http-error";
import { recordActivity } from "../common/record-activity";
import { escapeLikePattern } from "../common/sql-pattern";
import { DatabaseService } from "../database/database.service";
import { BookingAttendeesService } from "./booking-attendees.service";

interface OpenEventRow {
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
}

@Injectable()
export class OpenEventsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly bookingAttendees: BookingAttendeesService,
  ) {}

  async list(userId: string, search?: string, page = 1, limit = 12) {
    const normalizedPage = Number.isFinite(page)
      ? Math.max(Math.trunc(page), 1)
      : 1;
    const normalizedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 48)
      : 12;
    const normalizedSearch = search?.trim().slice(0, 160) ?? "";
    const pattern = normalizedSearch
      ? `%${escapeLikePattern(normalizedSearch)}%`
      : "";
    const filters = [userId, pattern];
    const [result, totals] = await Promise.all([
      this.database.query<OpenEventRow>(
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
            and (
              $2 = ''
              or b.title ilike $2 escape '\\'
              or coalesce(r.name, '') ilike $2 escape '\\'
              or u.name ilike $2 escape '\\'
            )
          group by b.id, r.id, u.id
          order by b.starts_at, b.id
          limit $3
          offset $4
        `,
        [...filters, normalizedLimit, (normalizedPage - 1) * normalizedLimit],
      ),
      this.database.query<{ total: string }>(
        `
          select count(*)::text as total
          from bookings b
          left join rooms r on r.id = b.room_id
          join users u on u.id = b.organizer_id
          where b.participation_mode = 'OPEN'
            and b.cancelled_at is null
            and b.starts_at > now()
            and (
              $1 = ''
              or b.title ilike $1 escape '\\'
              or coalesce(r.name, '') ilike $1 escape '\\'
              or u.name ilike $1 escape '\\'
            )
        `,
        [pattern],
      ),
    ]);
    const total = Number(totals.rows[0]?.total ?? 0);

    return {
      events: result.rows.map((row) => this.toOpenEvent(row, userId)),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages: Math.max(Math.ceil(total / normalizedLimit), 1),
      },
    };
  }

  async join(userId: string, bookingId: string): Promise<void> {
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
      await this.bookingAttendees.lock(client, [userId]);
      await this.bookingAttendees.assertAvailable(
        client,
        [userId],
        interval.rows,
        [bookingId],
      );
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

  async leave(userId: string, bookingId: string): Promise<void> {
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

  private toOpenEvent(row: OpenEventRow, userId: string) {
    return {
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
    };
  }
}
