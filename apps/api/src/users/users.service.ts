import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import type { CurrentUser } from "../common/types";
import type { UpdateProfileDto } from "./users.dto";

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  bio: string | null;
  avatar_preset: string;
  avatar_path: string | null;
  role: "USER" | "ADMIN";
  locale: "uk" | "en";
  theme: "SYSTEM" | "LIGHT" | "DARK";
  timezone: string | null;
  email_verified_at: Date | null;
  approved_at: Date | null;
  access_revoked_at: Date | null;
}

@Injectable()
export class UsersService {
  private readonly uploadDir: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService
  ) {
    this.uploadDir =
      config.get<string>("UPLOAD_DIR") ??
      resolve(process.cwd(), "storage/uploads");
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto
  ): Promise<CurrentUser> {
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "NAME_REQUIRED",
        "Name is required"
      );
    }
    if (dto.timezone && !this.isTimeZone(dto.timezone)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_TIMEZONE",
        "Unknown time zone"
      );
    }

    const previous = dto.avatarPreset
      ? await this.database.query<{ avatar_path: string | null }>(
          "select avatar_path from users where id = $1",
          [userId]
        )
      : null;
    const result = await this.database.query<ProfileRow>(
      `
        update users
        set
          name = coalesce($2, name),
          bio = case when $3::boolean then nullif(trim($4), '') else bio end,
          avatar_preset = coalesce($5, avatar_preset),
          avatar_path = case when $5::text is not null then null else avatar_path end,
          locale = coalesce($6, locale),
          theme = coalesce($7, theme),
          timezone = case when $8::boolean then nullif($9, '') else timezone end,
          updated_at = now()
        where id = $1
        returning *
      `,
      [
        userId,
        name ?? null,
        dto.bio !== undefined,
        dto.bio ?? null,
        dto.avatarPreset ?? null,
        dto.locale ?? null,
        dto.theme ?? null,
        dto.timezone !== undefined,
        dto.timezone ?? null
      ]
    );
    const previousPath = previous?.rows[0]?.avatar_path;
    if (previousPath) {
      await unlink(resolve(this.uploadDir, previousPath)).catch(() => undefined);
    }
    return this.toCurrentUser(result.rows[0]);
  }

  async saveAvatar(userId: string, file: Express.Multer.File) {
    let processed: Buffer;
    try {
      processed = await sharp(file.buffer, {
        failOn: "warning",
        limitInputPixels: 20_000_000
      })
        .rotate()
        .resize(512, 512, { fit: "cover", position: "attention" })
        .webp({ quality: 84 })
        .toBuffer();
    } catch {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_IMAGE",
        "Avatar must be a valid image"
      );
    }

    await mkdir(this.uploadDir, { recursive: true });
    const filename = `${randomUUID()}.webp`;
    await writeFile(resolve(this.uploadDir, filename), processed, {
      flag: "wx"
    });

    const previous = await this.database.query<{ avatar_path: string | null }>(
      "select avatar_path from users where id = $1",
      [userId]
    );
    await this.database.query(
      `
        update users
        set avatar_path = $2, updated_at = now()
        where id = $1
      `,
      [userId, filename]
    );
    const previousPath = previous.rows[0]?.avatar_path;
    if (previousPath && previousPath !== filename) {
      await unlink(resolve(this.uploadDir, previousPath)).catch(() => undefined);
    }

    return { avatarUrl: `/uploads/${filename}` };
  }

  async listColleagues(userId: string, search?: string) {
    const term = search?.trim() ?? "";
    const result = await this.database.query<{
      id: string;
      name: string;
      bio: string | null;
      avatar_preset: string;
      avatar_path: string | null;
    }>(
      `
        select id, name, bio, avatar_preset, avatar_path
        from users
        where id <> $1
          and email_verified_at is not null
          and approved_at is not null
          and access_revoked_at is null
          and ($2 = '' or name ilike '%' || $2 || '%')
        order by name
        limit 30
      `,
      [userId, term]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      bio: row.bio,
      avatarPreset: row.avatar_preset,
      avatarUrl: row.avatar_path ? `/uploads/${row.avatar_path}` : null
    }));
  }

  private isTimeZone(value: string): boolean {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }

  private toCurrentUser(row: ProfileRow): CurrentUser {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      bio: row.bio,
      avatarPreset: row.avatar_preset,
      avatarUrl: row.avatar_path ? `/uploads/${row.avatar_path}` : null,
      role: row.role,
      locale: row.locale,
      theme: row.theme,
      timezone: row.timezone,
      emailVerified: Boolean(row.email_verified_at),
      approved: Boolean(row.approved_at),
      accessRevoked: Boolean(row.access_revoked_at)
    };
  }
}
