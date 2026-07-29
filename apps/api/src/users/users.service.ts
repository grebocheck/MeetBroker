import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as argon2 from "argon2";
import sharp from "sharp";
import { createOpaqueToken, hashToken } from "../common/crypto";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import type { CurrentUser } from "../common/types";
import type {
  ChangeEmailDto,
  ChangePasswordDto,
  UpdateProfileDto
} from "./users.dto";

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  pending_email: string | null;
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

  async requestEmailChange(userId: string, dto: ChangeEmailDto) {
    const email = dto.email.trim().toLowerCase();
    const current = await this.database.query<{
      email: string;
      password_hash: string;
    }>("select email, password_hash from users where id = $1", [userId]);
    const user = current.rows[0];
    if (
      !user ||
      !(await argon2.verify(user.password_hash, dto.currentPassword))
    ) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        "CURRENT_PASSWORD_INCORRECT",
        "Current password is incorrect"
      );
    }
    if (user.email.trim().toLowerCase() === email) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "EMAIL_UNCHANGED",
        "New email must be different from the current email"
      );
    }
    const duplicate = await this.database.query(
      `
        select 1
        from users
        where id <> $1
          and (
            lower(trim(email)) = $2
            or lower(trim(pending_email)) = $2
          )
      `,
      [userId, email]
    );
    if (duplicate.rowCount) {
      throw apiError(
        HttpStatus.CONFLICT,
        "EMAIL_TAKEN",
        "This email is already registered"
      );
    }

    const token = createOpaqueToken();
    await this.database.transaction(async (client) => {
      await client.query(
        `
          update email_verification_tokens
          set used_at = now()
          where user_id = $1
            and pending_email is not null
            and used_at is null
        `,
        [userId]
      );
      await client.query(
        "update users set pending_email = $2, updated_at = now() where id = $1",
        [userId, email]
      );
      await client.query(
        `
          insert into email_verification_tokens (
            id, user_id, token_hash, pending_email, expires_at
          )
          values ($1, $2, $3, $4, now() + interval '24 hours')
        `,
        [randomUUID(), userId, hashToken(token), email]
      );
      await client.query(
        `
          insert into audit_logs
            (id, actor_id, action, target_type, target_id, details)
          values ($1, $2, 'EMAIL_CHANGE_REQUESTED', 'USER', $2, $3::jsonb)
        `,
        [randomUUID(), userId, JSON.stringify({ pendingEmail: email })]
      );
    });

    if (process.env.NODE_ENV !== "production") {
      process.stdout.write(
        `[dev-email] Confirm ${email}: /verify-email?token=${token}\n`
      );
    }
    return {
      pendingEmail: email,
      ...(process.env.NODE_ENV !== "production"
        ? { verificationToken: token }
        : {})
    };
  }

  async changePassword(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto
  ): Promise<void> {
    const passwordLength = Array.from(dto.newPassword).length;
    if (passwordLength < 8 || passwordLength > 72) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "PASSWORD_LENGTH",
        "Password must contain 8 to 72 characters"
      );
    }
    const current = await this.database.query<{ password_hash: string }>(
      "select password_hash from users where id = $1",
      [userId]
    );
    const passwordHash = current.rows[0]?.password_hash;
    if (
      !passwordHash ||
      !(await argon2.verify(passwordHash, dto.currentPassword))
    ) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        "CURRENT_PASSWORD_INCORRECT",
        "Current password is incorrect"
      );
    }
    if (await argon2.verify(passwordHash, dto.newPassword)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "PASSWORD_UNCHANGED",
        "New password must be different from the current password"
      );
    }
    const nextPasswordHash = await argon2.hash(dto.newPassword);
    await this.database.transaction(async (client) => {
      await client.query(
        "update users set password_hash = $2, updated_at = now() where id = $1",
        [userId, nextPasswordHash]
      );
      await client.query(
        `
          update sessions
          set revoked_at = now()
          where user_id = $1 and id <> $2 and revoked_at is null
        `,
        [userId, sessionId]
      );
      await client.query(
        `
          insert into audit_logs
            (id, actor_id, action, target_type, target_id)
          values ($1, $2, 'PASSWORD_CHANGED', 'USER', $2)
        `,
        [randomUUID(), userId]
      );
    });
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
      pendingEmail: row.pending_email,
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
