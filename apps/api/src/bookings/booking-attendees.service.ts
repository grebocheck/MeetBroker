import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { apiError } from "../common/http-error";
import type { Locale } from "../common/types";

export interface ParticipantRow {
  id: string;
  name: string;
  locale: Locale;
  timezone: string | null;
}

export interface BookingInterval {
  startsAt?: Date;
  endsAt?: Date;
  starts_at?: Date;
  ends_at?: Date;
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
export class BookingAttendeesService {
  async lock(client: PoolClient, userIds: string[]): Promise<void> {
    const sortedIds = [...new Set(userIds)].sort();
    for (const userId of sortedIds) {
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [userId],
      );
    }
  }

  async assertAvailable(
    client: PoolClient,
    userIds: string[],
    occurrences: BookingInterval[],
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

  async loadEligible(
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
}
