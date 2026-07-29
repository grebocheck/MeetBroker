import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import type {
  CreateRoomBlockDto,
  CreateRoomDto,
  RestrictUserDto,
  UpdateRoomDto
} from "./admin.dto";

@Injectable()
export class AdminService {
  private readonly uploadDir: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService
  ) {
    this.uploadDir =
      config.get<string>("UPLOAD_DIR") ??
      resolve(process.cwd(), "storage/uploads");
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
      [status ?? "", search?.trim() ?? ""]
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
      createdAt: user.created_at
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
      [userId, actorId]
    );
    if (!result.rowCount) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "EMAIL_VERIFICATION_REQUIRED",
        "User must verify email before approval"
      );
    }
    await this.audit(actorId, "USER_APPROVED", "USER", userId);
  }

  async revokeAccess(
    actorId: string,
    userId: string,
    reason: string
  ): Promise<void> {
    if (actorId === userId) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "CANNOT_REVOKE_SELF",
        "You cannot revoke your own access"
      );
    }
    await this.database.transaction(async (client) => {
      const user = await client.query<{ role: string }>(
        "select role from users where id = $1 for update",
        [userId]
      );
      if (!user.rows[0]) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "USER_NOT_FOUND",
          "User was not found"
        );
      }
      if (user.rows[0].role === "ADMIN") {
        const admins = await client.query<{ count: string }>(
          `
            select count(*)::text as count from users
            where role = 'ADMIN' and access_revoked_at is null
          `
        );
        if (Number(admins.rows[0].count) <= 1) {
          throw apiError(
            HttpStatus.CONFLICT,
            "LAST_ADMIN",
            "The last administrator cannot be revoked"
          );
        }
      }
      await client.query(
        `
          update users
          set access_revoked_at = now(), updated_at = now()
          where id = $1
        `,
        [userId]
      );
      await client.query(
        "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
        [userId]
      );
      await client.query(
        `
          insert into audit_logs
            (id, actor_id, action, target_type, target_id, details)
          values ($1, $2, 'USER_ACCESS_REVOKED', 'USER', $3, $4)
        `,
        [randomUUID(), actorId, userId, JSON.stringify({ reason })]
      );
    });
  }

  async updateRole(
    actorId: string,
    userId: string,
    role: "USER" | "ADMIN"
  ): Promise<void> {
    if (actorId === userId && role !== "ADMIN") {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "CANNOT_DEMOTE_SELF",
        "You cannot remove your own administrator role"
      );
    }
    await this.database.query(
      "update users set role = $2, updated_at = now() where id = $1",
      [userId, role]
    );
    await this.audit(actorId, "USER_ROLE_CHANGED", "USER", userId, { role });
  }

  async restrict(
    actorId: string,
    userId: string,
    dto: RestrictUserDto
  ) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= startsAt) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_RESTRICTION_RANGE",
        "Restriction end must be after its start"
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
        actorId
      ]
    );
    await this.audit(actorId, "USER_RESTRICTED", "USER", userId, {
      restrictionId: id,
      capability: dto.capability,
      expiresAt,
      reason: dto.reason.trim()
    });
    return { id };
  }

  async revokeRestriction(
    actorId: string,
    restrictionId: string
  ): Promise<void> {
    const result = await this.database.query<{ user_id: string }>(
      `
        update user_restrictions
        set revoked_at = now(), revoked_by = $2
        where id = $1 and revoked_at is null
        returning user_id
      `,
      [restrictionId, actorId]
    );
    if (result.rows[0]) {
      await this.audit(
        actorId,
        "USER_RESTRICTION_REVOKED",
        "USER",
        result.rows[0].user_id,
        { restrictionId }
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
        dto.workEnd ?? "19:00"
      ]
    );
    await this.audit(actorId, "ROOM_CREATED", "ROOM", id);
    return { id };
  }

  async updateRoom(
    actorId: string,
    roomId: string,
    dto: UpdateRoomDto
  ): Promise<void> {
    if (dto.workStart || dto.workEnd) {
      const current = await this.database.query<{
        work_start: string;
        work_end: string;
      }>(
        "select work_start::text, work_end::text from rooms where id = $1",
        [roomId]
      );
      if (!current.rows[0]) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "ROOM_NOT_FOUND",
          "Room was not found"
        );
      }
      this.assertWorkHours(
        dto.workStart ?? current.rows[0].work_start.slice(0, 5),
        dto.workEnd ?? current.rows[0].work_end.slice(0, 5)
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
        dto.workEnd ?? null
      ]
    );
    await this.audit(actorId, "ROOM_UPDATED", "ROOM", roomId, dto);
  }

  async saveRoomImage(
    actorId: string,
    roomId: string,
    file: Express.Multer.File
  ) {
    const room = await this.database.query<{ image_path: string | null }>(
      "select image_path from rooms where id = $1",
      [roomId]
    );
    if (!room.rows[0]) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "ROOM_NOT_FOUND",
        "Room was not found"
      );
    }

    let processed: Buffer;
    try {
      processed = await sharp(file.buffer, {
        failOn: "warning",
        limitInputPixels: 30_000_000
      })
        .rotate()
        .resize(1600, 900, { fit: "cover", position: "attention" })
        .webp({ quality: 84 })
        .toBuffer();
    } catch {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_ROOM_IMAGE",
        "Room image must be a valid image"
      );
    }

    await mkdir(this.uploadDir, { recursive: true });
    const filename = `room-${randomUUID()}.webp`;
    await writeFile(resolve(this.uploadDir, filename), processed, {
      flag: "wx"
    });
    await this.database.query(
      `
        update rooms
        set image_path = $2, image_url = null, updated_at = now()
        where id = $1
      `,
      [roomId, filename]
    );

    const previousPath = room.rows[0].image_path;
    if (previousPath && previousPath !== filename) {
      await unlink(resolve(this.uploadDir, previousPath)).catch(() => undefined);
    }
    await this.audit(actorId, "ROOM_IMAGE_UPDATED", "ROOM", roomId);
    return { imageUrl: `/uploads/${filename}` };
  }

  async removeRoomImage(actorId: string, roomId: string): Promise<void> {
    const room = await this.database.query<{ image_path: string | null }>(
      "select image_path from rooms where id = $1",
      [roomId]
    );
    if (!room.rows[0]) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "ROOM_NOT_FOUND",
        "Room was not found"
      );
    }

    await this.database.query(
      `
        update rooms
        set image_path = null, image_url = null, updated_at = now()
        where id = $1
      `,
      [roomId]
    );
    if (room.rows[0].image_path) {
      await unlink(resolve(this.uploadDir, room.rows[0].image_path)).catch(
        () => undefined
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
        "Room block time is invalid"
      );
    }
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
        actorId
      ]
    );
    await this.audit(actorId, "ROOM_BLOCK_CREATED", "ROOM_BLOCK", id, {
      roomId: dto.roomId
    });
    return { id };
  }

  async auditLogs() {
    const result = await this.database.query<{
      id: string;
      action: string;
      target_type: string;
      target_id: string | null;
      details: unknown;
      created_at: Date;
      actor_name: string | null;
    }>(
      `
        select
          a.id, a.action, a.target_type, a.target_id, a.details,
          a.created_at, u.name as actor_name
        from audit_logs a
        left join users u on u.id = a.actor_id
        order by a.created_at desc
        limit 100
      `
    );
    return result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      createdAt: row.created_at,
      actorName: row.actor_name
    }));
  }

  private assertWorkHours(start: string, end: string): void {
    if (
      !/^\d{2}:\d{2}$/.test(start) ||
      !/^\d{2}:\d{2}$/.test(end) ||
      start >= end
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_WORK_HOURS",
        "Working hours are invalid"
      );
    }
  }

  private async audit(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: unknown = {}
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
        JSON.stringify(details)
      ]
    );
  }
}
