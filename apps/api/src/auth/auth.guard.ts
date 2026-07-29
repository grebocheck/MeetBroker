import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import type {
  AuthenticatedRequest,
  CurrentUser,
  Locale,
  Role,
  Theme
} from "../common/types";
import { hashToken } from "../common/crypto";
import {
  IS_PUBLIC,
  REQUIRE_ADMIN,
  REQUIRE_APPROVED
} from "./auth.decorators";

interface AuthRow {
  session_id: string;
  id: string;
  name: string;
  email: string;
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

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly cookieName: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
    config: ConfigService
  ) {
    this.cookieName =
      config.get<string>("SESSION_COOKIE_NAME") ?? "meetbroker_session";
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[this.cookieName] as string | undefined;
    if (!token) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHENTICATED",
        "Authentication is required"
      );
    }

    const result = await this.database.query<AuthRow>(
      `
        select
          s.id as session_id,
          u.id,
          u.name,
          u.email,
          u.bio,
          u.avatar_preset,
          u.avatar_path,
          u.role,
          u.locale,
          u.theme,
          u.timezone,
          u.email_verified_at,
          u.approved_at,
          u.access_revoked_at
        from sessions s
        join users u on u.id = s.user_id
        where s.token_hash = $1
          and s.revoked_at is null
          and s.expires_at > now()
      `,
      [hashToken(token)]
    );

    const row = result.rows[0];
    if (!row) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        "SESSION_EXPIRED",
        "Session has expired"
      );
    }

    const user: CurrentUser = {
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

    if (user.accessRevoked) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        "ACCESS_REVOKED",
        "Corporate access has been revoked"
      );
    }

    const requireApproved = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_APPROVED,
      [context.getHandler(), context.getClass()]
    );
    if (requireApproved && (!user.emailVerified || !user.approved)) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        "APPROVAL_REQUIRED",
        "Corporate approval is required"
      );
    }

    const requireAdmin = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_ADMIN,
      [context.getHandler(), context.getClass()]
    );
    if (requireAdmin && user.role !== "ADMIN") {
      throw apiError(
        HttpStatus.FORBIDDEN,
        "ADMIN_REQUIRED",
        "Administrator access is required"
      );
    }

    const authenticated = request as AuthenticatedRequest;
    authenticated.user = user;
    authenticated.sessionId = row.session_id;
    return true;
  }
}
