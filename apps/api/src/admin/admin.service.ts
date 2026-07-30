import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { addDays, differenceInCalendarDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import sharp from "sharp";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import type {
  CreateRoomBlockDto,
  CreateRoomDto,
  RestrictUserDto,
  UpdateRoomDto,
} from "./admin.dto";

@Injectable()
export class AdminService {
  private readonly uploadDir: string;
  private readonly officeTimeZone: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    this.uploadDir =
      config.get<string>("UPLOAD_DIR") ??
      resolve(process.cwd(), "storage/uploads");
    this.officeTimeZone =
      config.get<string>("OFFICE_TIMEZONE") ?? "Europe/Kyiv";
  }

  async users(status?: string, search?: string) {
    const result = await this.database.query<{
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
                and ur.starts_at <= now()
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
        limit 100
      `,
      [status ?? "", search?.trim() ?? ""],
    );

    return result.rows.map((user) => ({
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
    }));
  }

  async bookings(status?: string, search?: string, roomId?: string) {
    const normalizedStatus = ["upcoming", "past", "cancelled"].includes(
      status ?? "",
    )
      ? status
      : "";
    const result = await this.database.query<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      participation_mode: "INVITE_ONLY" | "OPEN";
      override_reason: string | null;
      cancelled_at: Date | null;
      cancellation_reason: string | null;
      cancelled_by_name: string | null;
      room_id: string;
      room_name: string;
      room_floor: number;
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
          b.participation_mode,
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
        join rooms r on r.id = b.room_id
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
            or r.name ilike '%' || $2 || '%'
            or organizer.name ilike '%' || $2 || '%'
            or organizer.email ilike '%' || $2 || '%'
          )
          and ($3 = '' or r.id::text = $3)
        order by
          case when b.cancelled_at is null and b.ends_at > now() then 0 else 1 end,
          case when b.cancelled_at is null and b.ends_at > now() then b.starts_at end asc,
          b.starts_at desc
        limit 100
      `,
      [normalizedStatus, search?.trim() ?? "", roomId?.trim() ?? ""],
    );

    return result.rows.map((booking) => ({
      id: booking.id,
      title: booking.title,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      participationMode: booking.participation_mode,
      overrideReason: booking.override_reason,
      cancelledAt: booking.cancelled_at,
      cancellationReason: booking.cancellation_reason,
      cancelledByName: booking.cancelled_by_name,
      room: {
        id: booking.room_id,
        name: booking.room_name,
        floor: booking.room_floor,
      },
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
    }));
  }

  async approve(actorId: string, userId: string): Promise<void> {
    const result = await this.database.query(
      `
        update users
        set approved_at = now(), approved_by = $2, access_revoked_at = null,
          updated_at = now()
        where id = $1 and email_verified_at is not null
      `,
      [userId, actorId],
    );
    if (!result.rowCount) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "EMAIL_VERIFICATION_REQUIRED",
        "User must verify email before approval",
      );
    }
    await this.audit(actorId, "USER_APPROVED", "USER", userId);
  }

  async revokeAccess(
    actorId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    if (actorId === userId) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "CANNOT_REVOKE_SELF",
        "You cannot revoke your own access",
      );
    }
    await this.database.transaction(async (client) => {
      const user = await client.query<{ role: string }>(
        "select role from users where id = $1 for update",
        [userId],
      );
      if (!user.rows[0]) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "USER_NOT_FOUND",
          "User was not found",
        );
      }
      if (user.rows[0].role === "ADMIN") {
        const admins = await client.query<{ count: string }>(
          `
            select count(*)::text as count from users
            where role = 'ADMIN' and access_revoked_at is null
          `,
        );
        if (Number(admins.rows[0].count) <= 1) {
          throw apiError(
            HttpStatus.CONFLICT,
            "LAST_ADMIN",
            "The last administrator cannot be revoked",
          );
        }
      }
      await client.query(
        `
          update users
          set access_revoked_at = now(), updated_at = now()
          where id = $1
        `,
        [userId],
      );
      await client.query(
        "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
        [userId],
      );
      await client.query(
        `
          insert into audit_logs
            (id, actor_id, action, target_type, target_id, details)
          values ($1, $2, 'USER_ACCESS_REVOKED', 'USER', $3, $4)
        `,
        [randomUUID(), actorId, userId, JSON.stringify({ reason })],
      );
    });
  }

  async updateRole(
    actorId: string,
    userId: string,
    role: "USER" | "ADMIN",
  ): Promise<void> {
    if (actorId === userId && role !== "ADMIN") {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "CANNOT_DEMOTE_SELF",
        "You cannot remove your own administrator role",
      );
    }
    await this.database.query(
      "update users set role = $2, updated_at = now() where id = $1",
      [userId, role],
    );
    await this.audit(actorId, "USER_ROLE_CHANGED", "USER", userId, { role });
  }

  async restrict(actorId: string, userId: string, dto: RestrictUserDto) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= startsAt) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_RESTRICTION_RANGE",
        "Restriction end must be after its start",
      );
    }
    const id = randomUUID();
    await this.database.query(
      `
        insert into user_restrictions (
          id, user_id, capability, room_id, starts_at, expires_at,
          reason, created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        id,
        userId,
        dto.capability,
        dto.roomId ?? null,
        startsAt,
        expiresAt,
        dto.reason.trim(),
        actorId,
      ],
    );
    await this.audit(actorId, "USER_RESTRICTED", "USER", userId, {
      restrictionId: id,
      capability: dto.capability,
      expiresAt,
      reason: dto.reason.trim(),
    });
    return { id };
  }

  async revokeRestriction(
    actorId: string,
    restrictionId: string,
  ): Promise<void> {
    const result = await this.database.query<{ user_id: string }>(
      `
        update user_restrictions
        set revoked_at = now(), revoked_by = $2
        where id = $1 and revoked_at is null
        returning user_id
      `,
      [restrictionId, actorId],
    );
    if (result.rows[0]) {
      await this.audit(
        actorId,
        "USER_RESTRICTION_REVOKED",
        "USER",
        result.rows[0].user_id,
        { restrictionId },
      );
    }
  }

  async createRoom(actorId: string, dto: CreateRoomDto) {
    this.assertWorkHours(dto.workStart ?? "09:00", dto.workEnd ?? "19:00");
    const id = randomUUID();
    await this.database.query(
      `
        insert into rooms
          (id, name, floor, capacity, work_start, work_end)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        id,
        dto.name.trim(),
        dto.floor,
        dto.capacity,
        dto.workStart ?? "09:00",
        dto.workEnd ?? "19:00",
      ],
    );
    await this.audit(actorId, "ROOM_CREATED", "ROOM", id);
    return { id };
  }

  async updateRoom(
    actorId: string,
    roomId: string,
    dto: UpdateRoomDto,
  ): Promise<void> {
    if (dto.workStart || dto.workEnd) {
      const current = await this.database.query<{
        work_start: string;
        work_end: string;
      }>("select work_start::text, work_end::text from rooms where id = $1", [
        roomId,
      ]);
      if (!current.rows[0]) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "ROOM_NOT_FOUND",
          "Room was not found",
        );
      }
      this.assertWorkHours(
        dto.workStart ?? current.rows[0].work_start.slice(0, 5),
        dto.workEnd ?? current.rows[0].work_end.slice(0, 5),
      );
    }
    await this.database.query(
      `
        update rooms
        set
          name = coalesce($2, name),
          floor = coalesce($3, floor),
          capacity = coalesce($4, capacity),
          work_start = coalesce($5::time, work_start),
          work_end = coalesce($6::time, work_end),
          updated_at = now()
        where id = $1
      `,
      [
        roomId,
        dto.name?.trim() ?? null,
        dto.floor ?? null,
        dto.capacity ?? null,
        dto.workStart ?? null,
        dto.workEnd ?? null,
      ],
    );
    await this.audit(actorId, "ROOM_UPDATED", "ROOM", roomId, dto);
  }

  async saveRoomImage(
    actorId: string,
    roomId: string,
    file: Express.Multer.File,
  ) {
    const room = await this.database.query<{ image_path: string | null }>(
      "select image_path from rooms where id = $1",
      [roomId],
    );
    if (!room.rows[0]) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "ROOM_NOT_FOUND",
        "Room was not found",
      );
    }

    let processed: Buffer;
    try {
      processed = await sharp(file.buffer, {
        failOn: "warning",
        limitInputPixels: 30_000_000,
      })
        .rotate()
        .resize(1600, 900, { fit: "cover", position: "attention" })
        .webp({ quality: 84 })
        .toBuffer();
    } catch {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_ROOM_IMAGE",
        "Room image must be a valid image",
      );
    }

    await mkdir(this.uploadDir, { recursive: true });
    const filename = `room-${randomUUID()}.webp`;
    await writeFile(resolve(this.uploadDir, filename), processed, {
      flag: "wx",
    });
    await this.database.query(
      `
        update rooms
        set image_path = $2, image_url = null, updated_at = now()
        where id = $1
      `,
      [roomId, filename],
    );

    const previousPath = room.rows[0].image_path;
    if (previousPath && previousPath !== filename) {
      await unlink(resolve(this.uploadDir, previousPath)).catch(
        () => undefined,
      );
    }
    await this.audit(actorId, "ROOM_IMAGE_UPDATED", "ROOM", roomId);
    return { imageUrl: `/uploads/${filename}` };
  }

  async removeRoomImage(actorId: string, roomId: string): Promise<void> {
    const room = await this.database.query<{ image_path: string | null }>(
      "select image_path from rooms where id = $1",
      [roomId],
    );
    if (!room.rows[0]) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "ROOM_NOT_FOUND",
        "Room was not found",
      );
    }

    await this.database.query(
      `
        update rooms
        set image_path = null, image_url = null, updated_at = now()
        where id = $1
      `,
      [roomId],
    );
    if (room.rows[0].image_path) {
      await unlink(resolve(this.uploadDir, room.rows[0].image_path)).catch(
        () => undefined,
      );
    }
    await this.audit(actorId, "ROOM_IMAGE_REMOVED", "ROOM", roomId);
  }

  async createRoomBlock(actorId: string, dto: CreateRoomBlockDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      startsAt >= endsAt
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_BLOCK_RANGE",
        "Room block time is invalid",
      );
    }
    const durationMs = endsAt.getTime() - startsAt.getTime();
    if (durationMs > 24 * 60 * 60 * 1000) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "BLOCK_DURATION_TOO_LONG",
        "A room unavailability interval cannot exceed 24 hours",
      );
    }
    const recurrence = dto.recurrence ?? "NONE";
    if (recurrence === "NONE") {
      const id = randomUUID();
      await this.database.query(
        `
          insert into room_blocks (
            id, room_id, title, private_note, starts_at, ends_at, created_by
          )
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          id,
          dto.roomId,
          dto.title.trim(),
          dto.privateNote?.trim() || null,
          startsAt,
          endsAt,
          actorId,
        ],
      );
      await this.audit(actorId, "ROOM_BLOCK_CREATED", "ROOM_BLOCK", id, {
        roomId: dto.roomId,
        recurrence: "NONE",
        startsAt,
        endsAt,
      });
      return { id, occurrenceCount: 1 };
    }

    if (!dto.recurrenceUntil) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "RECURRENCE_END_REQUIRED",
        "Recurring room unavailability must have an end date",
      );
    }
    const recurrenceInterval = dto.recurrenceInterval ?? 1;
    const weekdays =
      recurrence === "WEEKLY"
        ? [...new Set(dto.weekdays ?? [])].sort((a, b) => a - b)
        : null;
    if (recurrence === "WEEKLY" && !weekdays?.length) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "RECURRENCE_WEEKDAYS_REQUIRED",
        "Weekly recurrence must include at least one weekday",
      );
    }

    const startLocal = toZonedTime(startsAt, this.officeTimeZone);
    const startKey = this.localDateKey(startLocal);
    const untilKey = dto.recurrenceUntil.slice(0, 10);
    const untilLocal = new Date(`${untilKey}T12:00:00Z`);
    const startDate = new Date(`${startKey}T12:00:00Z`);
    const recurrenceDays = differenceInCalendarDays(untilLocal, startDate);
    if (recurrenceDays < 0 || recurrenceDays > 366) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_RECURRENCE_RANGE",
        "Recurrence must end between its start date and one year later",
      );
    }

    const time = `${String(startLocal.getHours()).padStart(2, "0")}:${String(
      startLocal.getMinutes(),
    ).padStart(2, "0")}:00`;
    const occurrences: { startsAt: Date; endsAt: Date }[] = [];
    for (let dayOffset = 0; dayOffset <= recurrenceDays; dayOffset += 1) {
      const localDay = addDays(startLocal, dayOffset);
      const eligible =
        recurrence === "DAILY"
          ? dayOffset % recurrenceInterval === 0
          : Math.floor(dayOffset / 7) % recurrenceInterval === 0 &&
            weekdays!.includes(localDay.getDay());
      if (!eligible) continue;
      const occurrenceStart = fromZonedTime(
        `${this.localDateKey(localDay)}T${time}`,
        this.officeTimeZone,
      );
      if (occurrenceStart < startsAt) continue;
      occurrences.push({
        startsAt: occurrenceStart,
        endsAt: new Date(occurrenceStart.getTime() + durationMs),
      });
    }
    if (!occurrences.length) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "EMPTY_RECURRENCE",
        "Recurrence does not produce any room unavailability intervals",
      );
    }

    const seriesId = randomUUID();
    await this.database.transaction(async (client) => {
      await client.query(
        `
          insert into room_block_series (
            id, room_id, title, private_note, frequency,
            recurrence_interval, weekdays, starts_at, ends_at,
            recurrence_until, timezone, created_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          seriesId,
          dto.roomId,
          dto.title.trim(),
          dto.privateNote?.trim() || null,
          recurrence,
          recurrenceInterval,
          weekdays,
          startsAt,
          endsAt,
          untilKey,
          this.officeTimeZone,
          actorId,
        ],
      );
      for (const [index, occurrence] of occurrences.entries()) {
        await client.query(
          `
            insert into room_blocks (
              id, room_id, title, private_note, starts_at, ends_at,
              created_by, series_id, occurrence_index
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            randomUUID(),
            dto.roomId,
            dto.title.trim(),
            dto.privateNote?.trim() || null,
            occurrence.startsAt,
            occurrence.endsAt,
            actorId,
            seriesId,
            index,
          ],
        );
      }
    });
    await this.audit(
      actorId,
      "ROOM_BLOCK_SERIES_CREATED",
      "ROOM_BLOCK_SERIES",
      seriesId,
      {
        roomId: dto.roomId,
        recurrence,
        recurrenceInterval,
        weekdays,
        recurrenceUntil: untilKey,
        occurrenceCount: occurrences.length,
      },
    );
    return { id: seriesId, occurrenceCount: occurrences.length };
  }

  async roomBlocks(roomId?: string) {
    const result = await this.database.query<{
      id: string;
      kind: "ONCE" | "SERIES";
      room_id: string;
      room_name: string;
      title: string;
      private_note: string | null;
      starts_at: Date;
      ends_at: Date;
      frequency: "DAILY" | "WEEKLY" | null;
      recurrence_interval: number | null;
      weekdays: number[] | null;
      recurrence_until: string | null;
      occurrence_count: string;
    }>(
      `
        select
          rb.id,
          'ONCE'::text as kind,
          rb.room_id,
          r.name as room_name,
          rb.title,
          rb.private_note,
          rb.starts_at,
          rb.ends_at,
          null::text as frequency,
          null::integer as recurrence_interval,
          null::smallint[] as weekdays,
          null::text as recurrence_until,
          '1'::text as occurrence_count
        from room_blocks rb
        join rooms r on r.id = rb.room_id
        where rb.series_id is null
          and rb.cancelled_at is null
          and rb.ends_at > now()
          and ($1 = '' or rb.room_id::text = $1)
        union all
        select
          s.id,
          'SERIES'::text as kind,
          s.room_id,
          r.name,
          s.title,
          s.private_note,
          s.starts_at,
          s.ends_at,
          s.frequency,
          s.recurrence_interval,
          s.weekdays,
          s.recurrence_until::text,
          count(rb.id) filter (
            where rb.cancelled_at is null and rb.ends_at > now()
          )::text
        from room_block_series s
        join rooms r on r.id = s.room_id
        left join room_blocks rb on rb.series_id = s.id
        where s.cancelled_at is null
          and ($1 = '' or s.room_id::text = $1)
        group by s.id, r.name
        having count(rb.id) filter (
          where rb.cancelled_at is null and rb.ends_at > now()
        ) > 0
        order by starts_at
      `,
      [roomId?.trim() ?? ""],
    );
    return result.rows.map((block) => ({
      id: block.id,
      kind: block.kind,
      roomId: block.room_id,
      roomName: block.room_name,
      title: block.title,
      privateNote: block.private_note,
      startsAt: block.starts_at,
      endsAt: block.ends_at,
      frequency: block.frequency,
      recurrenceInterval: block.recurrence_interval,
      weekdays: block.weekdays,
      recurrenceUntil: block.recurrence_until,
      occurrenceCount: Number(block.occurrence_count),
    }));
  }

  async cancelRoomBlock(
    actorId: string,
    id: string,
    scope: string,
  ): Promise<void> {
    if (scope === "series") {
      await this.database.transaction(async (client) => {
        const series = await client.query(
          `
            update room_block_series
            set cancelled_at = now(), cancelled_by = $2
            where id = $1 and cancelled_at is null
          `,
          [id, actorId],
        );
        if (!series.rowCount) {
          throw apiError(
            HttpStatus.NOT_FOUND,
            "ROOM_BLOCK_SERIES_NOT_FOUND",
            "Room unavailability series was not found",
          );
        }
        await client.query(
          `
            update room_blocks
            set cancelled_at = now()
            where series_id = $1 and cancelled_at is null and ends_at > now()
          `,
          [id],
        );
      });
      await this.audit(
        actorId,
        "ROOM_BLOCK_SERIES_CANCELLED",
        "ROOM_BLOCK_SERIES",
        id,
      );
      return;
    }
    const result = await this.database.query(
      `
        update room_blocks
        set cancelled_at = now()
        where id = $1 and cancelled_at is null
      `,
      [id],
    );
    if (!result.rowCount) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "ROOM_BLOCK_NOT_FOUND",
        "Room unavailability interval was not found",
      );
    }
    await this.audit(actorId, "ROOM_BLOCK_CANCELLED", "ROOM_BLOCK", id);
  }

  async auditLogs(
    category?: string,
    search?: string,
    page = 1,
    limit = 25,
  ) {
    const normalizedCategory = ["booking", "access", "room"].includes(
      category ?? "",
    )
      ? category
      : "";
    const normalizedPage = Number.isFinite(page)
      ? Math.max(Math.trunc(page), 1)
      : 1;
    const normalizedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 100)
      : 25;
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
        normalizedLimit,
        (normalizedPage - 1) * normalizedLimit,
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
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages: Math.max(Math.ceil(total / normalizedLimit), 1),
      },
    };
  }

  private assertWorkHours(start: string, end: string): void {
    const validClock = (value: string) => {
      const match = /^(\d{2}):(\d{2})$/.exec(value);
      return Boolean(
        match &&
        Number(match[1]) >= 0 &&
        Number(match[1]) <= 23 &&
        Number(match[2]) >= 0 &&
        Number(match[2]) <= 59,
      );
    };
    if (!validClock(start) || !validClock(end) || start >= end) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_WORK_HOURS",
        "Working hours are invalid",
      );
    }
  }

  private localDateKey(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  private async audit(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: unknown = {},
  ): Promise<void> {
    await this.database.query(
      `
        insert into audit_logs
          (id, actor_id, action, target_type, target_id, details)
        values ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        randomUUID(),
        actorId,
        action,
        targetType,
        targetId,
        JSON.stringify(details),
      ],
    );
  }
}
