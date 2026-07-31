import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

function pagination(page: number, limit: number, fallback: number) {
  return {
    page: Number.isFinite(page) ? Math.max(Math.trunc(page), 1) : 1,
    limit: Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 100)
      : fallback,
  };
}

@Injectable()
export class AdminQueriesService {
  constructor(private readonly database: DatabaseService) {}

  async users(status?: string, search?: string, page = 1, limit = 12) {
    const normalizedStatus = ["pending", "active", "revoked"].includes(
      status ?? "",
    )
      ? status
      : "";
    const normalized = pagination(page, limit, 12);
    const filters = [normalizedStatus, search?.trim() ?? ""];
    const [result, totals] = await Promise.all([
      this.database.query<{
        id: string;
        name: string;
        email: string;
        role: string;
        bio: string | null;
        avatar_preset: string;
        avatar_path: string | null;
        email_verified_at: Date | null;
        approved_at: Date | null;
        access_revoked_at: Date | null;
        created_at: Date;
        restrictions: unknown;
      }>(
        `
        select
          u.id,
          u.name,
          u.email,
          u.role,
          u.bio,
          u.avatar_preset,
          u.avatar_path,
          u.email_verified_at,
          u.approved_at,
          u.access_revoked_at,
          u.created_at,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', ur.id,
                'capability', ur.capability,
                'roomId', ur.room_id,
                'startsAt', ur.starts_at,
                'expiresAt', ur.expires_at,
                'reason', ur.reason
              )
            ) filter (
              where ur.id is not null
                and ur.revoked_at is null
                and (ur.expires_at is null or ur.expires_at > now())
            ),
            '[]'::jsonb
          ) as restrictions
        from users u
        left join user_restrictions ur on ur.user_id = u.id
        where
          ($1 = '' or
            ($1 = 'pending' and u.email_verified_at is not null
              and u.approved_at is null and u.access_revoked_at is null) or
            ($1 = 'active' and u.approved_at is not null
              and u.access_revoked_at is null) or
            ($1 = 'revoked' and u.access_revoked_at is not null))
          and ($2 = '' or u.name ilike '%' || $2 || '%'
            or u.email ilike '%' || $2 || '%')
        group by u.id
        order by
          (u.approved_at is null and u.access_revoked_at is null) desc,
          u.created_at desc
        limit $3
        offset $4
      `,
        [
          ...filters,
          normalized.limit,
          (normalized.page - 1) * normalized.limit,
        ],
      ),
      this.database.query<{ total: string }>(
        `
          select count(*)::text as total
          from users u
          where
            ($1 = '' or
              ($1 = 'pending' and u.email_verified_at is not null
                and u.approved_at is null and u.access_revoked_at is null) or
              ($1 = 'active' and u.approved_at is not null
                and u.access_revoked_at is null) or
              ($1 = 'revoked' and u.access_revoked_at is not null))
            and ($2 = '' or u.name ilike '%' || $2 || '%'
              or u.email ilike '%' || $2 || '%')
        `,
        filters,
      ),
    ]);

    const total = Number(totals.rows[0]?.total ?? 0);
    return {
      users: result.rows.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        avatarPreset: user.avatar_preset,
        avatarUrl: user.avatar_path ? `/uploads/${user.avatar_path}` : null,
        emailVerified: Boolean(user.email_verified_at),
        approved: Boolean(user.approved_at),
        accessRevoked: Boolean(user.access_revoked_at),
        restrictions: user.restrictions,
        createdAt: user.created_at,
      })),
      pagination: {
        ...normalized,
        total,
        totalPages: Math.max(Math.ceil(total / normalized.limit), 1),
      },
    };
  }

  async bookings(
    status?: string,
    search?: string,
    roomId?: string,
    page = 1,
    limit = 15,
  ) {
    const normalizedStatus = ["upcoming", "past", "cancelled"].includes(
      status ?? "",
    )
      ? status
      : "";
    const normalized = pagination(page, limit, 15);
    const filters = [
      normalizedStatus,
      search?.trim() ?? "",
      roomId?.trim() ?? "",
    ];
    const [result, totals] = await Promise.all([
      this.database.query<{
        id: string;
        title: string;
        starts_at: Date;
        ends_at: Date;
        meeting_type: "ROOM" | "ONLINE";
        meeting_url: string | null;
        image_path: string | null;
        participation_mode: "INVITE_ONLY" | "OPEN";
        series_id: string | null;
        override_reason: string | null;
        cancelled_at: Date | null;
        cancellation_reason: string | null;
        cancelled_by_name: string | null;
        room_id: string | null;
        room_name: string | null;
        room_floor: number | null;
        organizer_id: string;
        organizer_name: string;
        organizer_email: string;
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
          b.meeting_type,
          b.meeting_url,
          b.image_path,
          b.participation_mode,
          b.series_id,
          b.override_reason,
          b.cancelled_at,
          cancellation_audit.details->>'reason' as cancellation_reason,
          canceller.name as cancelled_by_name,
          r.id as room_id,
          r.name as room_name,
          r.floor as room_floor,
          organizer.id as organizer_id,
          organizer.name as organizer_name,
          organizer.email as organizer_email,
          organizer.avatar_preset as organizer_avatar_preset,
          organizer.avatar_path as organizer_avatar_path,
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', participant.id,
                  'name', participant.name,
                  'email', participant.email,
                  'avatarPreset', participant.avatar_preset,
                  'avatarUrl', case
                    when participant.avatar_path is not null
                    then '/uploads/' || participant.avatar_path
                    else null
                  end,
                  'status', bp.status
                )
                order by participant.name
              )
              from booking_participants bp
              join users participant on participant.id = bp.user_id
              where bp.booking_id = b.id
            ),
            '[]'::jsonb
          ) as participants
        from bookings b
        left join rooms r on r.id = b.room_id
        join users organizer on organizer.id = b.organizer_id
        left join users canceller on canceller.id = b.cancelled_by
        left join lateral (
          select details
          from audit_logs
          where action = 'BOOKING_CANCELLED_BY_ADMIN'
            and target_type = 'BOOKING'
            and target_id = b.id
          order by created_at desc
          limit 1
        ) cancellation_audit on true
        where
          (
            $1 = ''
            or ($1 = 'upcoming' and b.cancelled_at is null and b.ends_at > now())
            or ($1 = 'past' and b.cancelled_at is null and b.ends_at <= now())
            or ($1 = 'cancelled' and b.cancelled_at is not null)
          )
          and (
            $2 = ''
            or b.title ilike '%' || $2 || '%'
            or coalesce(r.name, 'онлайн') ilike '%' || $2 || '%'
            or organizer.name ilike '%' || $2 || '%'
            or organizer.email ilike '%' || $2 || '%'
          )
          and ($3 = '' or r.id::text = $3)
        order by
          case when b.cancelled_at is null and b.ends_at > now() then 0 else 1 end,
          case when b.cancelled_at is null and b.ends_at > now() then b.starts_at end asc,
          b.starts_at desc
        limit $4
        offset $5
      `,
        [
          ...filters,
          normalized.limit,
          (normalized.page - 1) * normalized.limit,
        ],
      ),
      this.database.query<{ total: string }>(
        `
          select count(*)::text as total
          from bookings b
          left join rooms r on r.id = b.room_id
          join users organizer on organizer.id = b.organizer_id
          where
            (
              $1 = ''
              or ($1 = 'upcoming' and b.cancelled_at is null
                and b.ends_at > now())
              or ($1 = 'past' and b.cancelled_at is null
                and b.ends_at <= now())
              or ($1 = 'cancelled' and b.cancelled_at is not null)
            )
            and (
              $2 = ''
              or b.title ilike '%' || $2 || '%'
              or coalesce(r.name, 'онлайн') ilike '%' || $2 || '%'
              or organizer.name ilike '%' || $2 || '%'
              or organizer.email ilike '%' || $2 || '%'
            )
            and ($3 = '' or r.id::text = $3)
        `,
        filters,
      ),
    ]);

    const total = Number(totals.rows[0]?.total ?? 0);
    return {
      bookings: result.rows.map((booking) => ({
        id: booking.id,
        title: booking.title,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        meetingType: booking.meeting_type,
        meetingUrl: booking.meeting_url,
        imageUrl: booking.image_path ? `/uploads/${booking.image_path}` : null,
        participationMode: booking.participation_mode,
        seriesId: booking.series_id,
        overrideReason: booking.override_reason,
        cancelledAt: booking.cancelled_at,
        cancellationReason: booking.cancellation_reason,
        cancelledByName: booking.cancelled_by_name,
        room: booking.room_id
          ? {
              id: booking.room_id,
              name: booking.room_name,
              floor: booking.room_floor,
            }
          : null,
        organizer: {
          id: booking.organizer_id,
          name: booking.organizer_name,
          email: booking.organizer_email,
          avatarPreset: booking.organizer_avatar_preset,
          avatarUrl: booking.organizer_avatar_path
            ? `/uploads/${booking.organizer_avatar_path}`
            : null,
        },
        participants: booking.participants,
      })),
      pagination: {
        ...normalized,
        total,
        totalPages: Math.max(Math.ceil(total / normalized.limit), 1),
      },
    };
  }

  async auditLogs(category?: string, search?: string, page = 1, limit = 25) {
    const normalizedCategory = [
      "booking",
      "access",
      "room",
      "notification",
    ].includes(category ?? "")
      ? category
      : "";
    const normalized = pagination(page, limit, 25);
    const result = await this.database.query<{
      id: string;
      action: string;
      target_type: string;
      target_id: string | null;
      target_name: string | null;
      details: unknown;
      created_at: Date;
      actor_name: string | null;
      actor_email: string | null;
      total: string;
    }>(
      `
        select
          a.id, a.action, a.target_type, a.target_id, a.details,
          a.created_at, actor.name as actor_name, actor.email as actor_email,
          count(*) over()::text as total,
          case
            when a.target_type = 'BOOKING' then target_booking.title
            when a.target_type = 'ROOM' then target_room.name
            when a.target_type = 'ROOM_BLOCK' then target_room_block.title
            when a.target_type = 'ROOM_BLOCK_SERIES' then target_room_block_series.title
            when a.target_type = 'USER' then target_user.name
            else null
          end as target_name
        from audit_logs a
        left join users actor on actor.id = a.actor_id
        left join bookings target_booking
          on a.target_type = 'BOOKING' and target_booking.id = a.target_id
        left join rooms target_room
          on a.target_type = 'ROOM' and target_room.id = a.target_id
        left join room_blocks target_room_block
          on a.target_type = 'ROOM_BLOCK' and target_room_block.id = a.target_id
        left join room_block_series target_room_block_series
          on a.target_type = 'ROOM_BLOCK_SERIES'
          and target_room_block_series.id = a.target_id
        left join users target_user
          on a.target_type = 'USER' and target_user.id = a.target_id
        where
          (
            $1 = ''
            or ($1 = 'booking' and a.target_type = 'BOOKING')
            or ($1 = 'access' and a.target_type = 'USER')
            or (
              $1 = 'room'
              and a.target_type in ('ROOM', 'ROOM_BLOCK', 'ROOM_BLOCK_SERIES')
            )
            or (
              $1 = 'notification'
              and a.target_type = 'NOTIFICATION_DELIVERY'
            )
          )
          and (
            $2 = ''
            or a.action ilike '%' || $2 || '%'
            or actor.name ilike '%' || $2 || '%'
            or actor.email ilike '%' || $2 || '%'
            or target_booking.title ilike '%' || $2 || '%'
            or target_room.name ilike '%' || $2 || '%'
            or target_room_block.title ilike '%' || $2 || '%'
            or target_room_block_series.title ilike '%' || $2 || '%'
            or target_user.name ilike '%' || $2 || '%'
          )
        order by a.created_at desc
        limit $3
        offset $4
      `,
      [
        normalizedCategory,
        search?.trim() ?? "",
        normalized.limit,
        (normalized.page - 1) * normalized.limit,
      ],
    );
    const total = Number(result.rows[0]?.total ?? 0);
    return {
      logs: result.rows.map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        targetName: row.target_name,
        details: row.details,
        createdAt: row.created_at,
        actorName: row.actor_name,
        actorEmail: row.actor_email,
      })),
      pagination: {
        ...normalized,
        total,
        totalPages: Math.max(Math.ceil(total / normalized.limit), 1),
      },
    };
  }
}
