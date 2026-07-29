import {
  ConflictException,
  HttpStatus,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import { createOpaqueToken, hashToken } from "../common/crypto";
import type { CurrentUser, Locale, Role, Theme } from "../common/types";
import type { LoginDto, RegisterDto } from "./auth.dto";

interface UserRow {
  id: string;
  name: string;
  email: string;
  pending_email: string | null;
  password_hash: string;
  bio: string | null;
  avatar_preset: string;
  avatar_path: string | null;
  role: Role;
  locale: Locale;
  theme: Theme;
  timezone: string | null;
  email_verified_at: Date | null;
  approved_at: Date | null;
  access_revoked_at: Date | null;
}

export interface SessionResult {
  token: string;
  expiresAt: Date;
  user: CurrentUser;
}

@Injectable()
export class AuthService {
  private readonly sessionTtlDays: number;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService
  ) {
    this.sessionTtlDays = Number(config.get("SESSION_TTL_DAYS") ?? 30);
  }

  async register(dto: RegisterDto): Promise<{
    userId: string;
    verificationToken?: string;
  }> {
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const passwordLength = Array.from(dto.password).length;

    if (!name) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "NAME_REQUIRED",
        "Name is required"
      );
    }
    if (passwordLength < 8 || passwordLength > 72) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "PASSWORD_LENGTH",
        "Password must contain 8 to 72 characters"
      );
    }

    const existing = await this.database.query(
      `
        select 1
        from users
        where lower(trim(email)) = $1
          or lower(trim(pending_email)) = $1
      `,
      [email]
    );
    if (existing.rowCount) {
      throw new ConflictException({
        code: "EMAIL_TAKEN",
        message: "This email is already registered"
      });
    }

    const userId = randomUUID();
    const verificationToken = createOpaqueToken();
    const verificationId = randomUUID();
    const passwordHash = await argon2.hash(dto.password);

    try {
      await this.database.transaction(async (client) => {
        await client.query(
          `
            insert into users (id, name, email, password_hash)
            values ($1, $2, $3, $4)
          `,
          [userId, name, email, passwordHash]
        );
        await client.query(
          `
            insert into email_verification_tokens
              (id, user_id, token_hash, expires_at)
            values ($1, $2, $3, now() + interval '24 hours')
          `,
          [verificationId, userId, hashToken(verificationToken)]
        );
        await client.query(
          `
            insert into notification_preferences (user_id)
            values ($1)
          `,
          [userId]
        );
        await client.query(
          `
            insert into notification_subscriptions
              (user_id, category, channel, enabled)
            select
              $1,
              category,
              channel,
              channel <> 'TELEGRAM'
            from unnest(
              array['INVITATIONS', 'CHANGES', 'REMINDERS', 'ACCESS']
            ) as categories(category)
            cross join unnest(
              array['IN_APP', 'EMAIL', 'TELEGRAM']
            ) as channels(channel)
          `,
          [userId]
        );
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as Error & { code: string }).code === "23505"
      ) {
        throw new ConflictException({
          code: "EMAIL_TAKEN",
          message: "This email is already registered"
        });
      }
      throw error;
    }

    if (process.env.NODE_ENV !== "production") {
      process.stdout.write(
        `[dev-email] Verify ${email}: /verify-email?token=${verificationToken}\n`
      );
    }

    return {
      userId,
      ...(process.env.NODE_ENV !== "production" ? { verificationToken } : {})
    };
  }

  async verifyEmail(token: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const result = await client.query<{
        user_id: string;
        pending_email: string | null;
      }>(
        `
          update email_verification_tokens
          set used_at = now()
          where token_hash = $1
            and used_at is null
            and expires_at > now()
          returning user_id, pending_email
        `,
        [hashToken(token)]
      );
      const verification = result.rows[0];
      if (!verification) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "INVALID_VERIFICATION_TOKEN",
          "Verification link is invalid or expired"
        );
      }

      if (verification.pending_email) {
        const changed = await client.query(
          `
            update users
            set
              email = pending_email,
              pending_email = null,
              email_verified_at = now(),
              updated_at = now()
            where id = $1
              and lower(trim(pending_email)) = lower(trim($2))
          `,
          [verification.user_id, verification.pending_email]
        );
        if (!changed.rowCount) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            "EMAIL_CHANGE_SUPERSEDED",
            "A newer email change request is active"
          );
        }
        await client.query(
          `
            insert into audit_logs
              (id, actor_id, action, target_type, target_id)
            values ($1, $2, 'EMAIL_CHANGED', 'USER', $2)
          `,
          [randomUUID(), verification.user_id]
        );
      } else {
        await client.query(
          `
            update users
            set email_verified_at = coalesce(email_verified_at, now())
            where id = $1
          `,
          [verification.user_id]
        );
      }
    });
  }

  async login(dto: LoginDto): Promise<SessionResult> {
    const email = dto.email.trim().toLowerCase();
    const result = await this.database.query<UserRow>(
      "select * from users where lower(trim(email)) = $1",
      [email]
    );
    const row = result.rows[0];
    if (!row || !(await argon2.verify(row.password_hash, dto.password))) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect"
      );
    }
    if (row.access_revoked_at) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        "ACCESS_REVOKED",
        "Corporate access has been revoked"
      );
    }

    const token = createOpaqueToken();
    const expiresAt = new Date(
      Date.now() + this.sessionTtlDays * 24 * 60 * 60 * 1000
    );
    await this.database.query(
      `
        insert into sessions (id, user_id, token_hash, expires_at)
        values ($1, $2, $3, $4)
      `,
      [randomUUID(), row.id, hashToken(token), expiresAt]
    );

    return { token, expiresAt, user: this.toCurrentUser(row) };
  }

  async logout(sessionId: string): Promise<void> {
    await this.database.query(
      "update sessions set revoked_at = now() where id = $1",
      [sessionId]
    );
  }

  private toCurrentUser(row: UserRow): CurrentUser {
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
