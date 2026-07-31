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

  async approve(actorId: string, userId: string): Promise<void> {
    const result = await this.database.query(
      `
        update users
        set approved_at = now(), approved_by = $2, updated_at = now()
        where id = $1
          and email_verified_at is not null
          and approved_at is null
          and access_revoked_at is null
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
        throw apiError(
          HttpStatus.FORBIDDEN,
          "ADMIN_MANAGED_BY_CLI",
          "Administrator access can only be changed through the server CLI",
        );
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

  async restoreAccess(actorId: string, userId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const user = await client.query<{
        role: string;
        access_revoked_at: Date | null;
      }>("select role, access_revoked_at from users where id = $1 for update", [
        userId,
      ]);
      const target = user.rows[0];
      if (!target) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "USER_NOT_FOUND",
          "User was not found",
        );
      }
      if (target.role === "ADMIN") {
        throw apiError(
          HttpStatus.FORBIDDEN,
          "ADMIN_MANAGED_BY_CLI",
          "Administrator access can only be changed through the server CLI",
        );
      }
      if (!target.access_revoked_at) return;
      await client.query(
        "update users set access_revoked_at = null, updated_at = now() where id = $1",
        [userId],
      );
      await client.query(
        `
          insert into audit_logs
            (id, actor_id, action, target_type, target_id, details)
          values ($1, $2, 'USER_ACCESS_RESTORED', 'USER', $3, '{}'::jsonb)
        `,
        [randomUUID(), actorId, userId],
      );
    });
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
    if (dto.capability === "ACCOUNT_LOGIN" && dto.roomId) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_RESTRICTION_SCOPE",
        "Account login restrictions cannot be scoped to a room",
      );
    }
    if (dto.capability === "ACCOUNT_LOGIN" && actorId === userId) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "CANNOT_RESTRICT_SELF",
        "You cannot restrict your own account login",
      );
    }

    const id = randomUUID();
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
        throw apiError(
          HttpStatus.FORBIDDEN,
          "ADMIN_MANAGED_BY_CLI",
          "Administrator access policies can only be changed through the server CLI",
        );
      }
      await client.query(
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
      await client.query(
        `
          insert into audit_logs
            (id, actor_id, action, target_type, target_id, details)
          values ($1, $2, 'USER_RESTRICTED', 'USER', $3, $4)
        `,
        [
          randomUUID(),
          actorId,
          userId,
          JSON.stringify({
            restrictionId: id,
            capability: dto.capability,
            roomId: dto.roomId ?? null,
            startsAt,
            expiresAt,
            reason: dto.reason.trim(),
          }),
        ],
      );
    });
    return { id };
  }

  async revokeRestriction(
    actorId: string,
    restrictionId: string,
  ): Promise<void> {
    const restriction = await this.database.transaction(async (client) => {
      const target = await client.query<{ role: string }>(
        `
          select u.role
          from user_restrictions ur
          join users u on u.id = ur.user_id
          where ur.id = $1 and ur.revoked_at is null
          for update of ur
        `,
        [restrictionId],
      );
      if (!target.rows[0]) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "RESTRICTION_NOT_FOUND",
          "Active restriction was not found",
        );
      }
      if (target.rows[0].role === "ADMIN") {
        throw apiError(
          HttpStatus.FORBIDDEN,
          "ADMIN_MANAGED_BY_CLI",
          "Administrator access policies can only be changed through the server CLI",
        );
      }
      const result = await client.query<{
        user_id: string;
        capability: string;
        room_id: string | null;
        starts_at: Date;
        expires_at: Date | null;
        reason: string;
      }>(
        `
          update user_restrictions
          set revoked_at = now(), revoked_by = $2
          where id = $1 and revoked_at is null
          returning user_id, capability, room_id, starts_at, expires_at, reason
        `,
        [restrictionId, actorId],
      );
      return result.rows[0]!;
    });
    await this.audit(
      actorId,
      "USER_RESTRICTION_REVOKED",
      "USER",
      restriction.user_id,
      {
        restrictionId,
        capability: restriction.capability,
        roomId: restriction.room_id,
        startsAt: restriction.starts_at,
        expiresAt: restriction.expires_at,
        reason: restriction.reason,
      },
    );
  }

  async createRoom(actorId: string, dto: CreateRoomDto) {
    this.assertWorkHours(dto.workStart ?? "09:00", dto.workEnd ?? "19:00");
    this.assertWorkingDays(dto.workingDays ?? [1, 2, 3, 4, 5]);
    const id = randomUUID();
    await this.database.query(
      `
        insert into rooms
          (id, name, floor, capacity, work_start, work_end, working_days)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        id,
        dto.name.trim(),
        dto.floor,
        dto.capacity,
        dto.workStart ?? "09:00",
        dto.workEnd ?? "19:00",
        dto.workingDays ?? [1, 2, 3, 4, 5],
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
    if (dto.workingDays) this.assertWorkingDays(dto.workingDays);
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
          working_days = coalesce($7::smallint[], working_days),
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
        dto.workingDays ?? null,
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

  private assertWorkingDays(workingDays: number[]): void {
    if (
      workingDays.length === 0 ||
      workingDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_WORKING_DAYS",
        "Room must have at least one valid working day",
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
