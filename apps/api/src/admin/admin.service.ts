import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import type {
  CreateRoomDto,
  RestrictUserDto,
  UpdateRoomDto,
} from "./admin.dto";

@Injectable()
export class AdminService {
  private readonly uploadDir: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    this.uploadDir =
      config.get<string>("UPLOAD_DIR") ??
      resolve(process.cwd(), "storage/uploads");
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
