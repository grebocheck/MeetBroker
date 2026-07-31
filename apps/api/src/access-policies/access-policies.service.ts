import { HttpStatus, Injectable } from "@nestjs/common";
import { apiError } from "../common/http-error";
import type { ActiveRestriction, Capability } from "../common/types";
import type { SqlExecutor } from "../database/database.service";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class AccessPoliciesService {
  constructor(private readonly database: DatabaseService) {}

  async listActive(userId: string): Promise<ActiveRestriction[]> {
    return this.findActive(this.database, userId);
  }

  async assertAllowed(
    executor: SqlExecutor,
    userId: string,
    capability: Capability,
    roomId?: string,
  ): Promise<void> {
    const restrictions = await this.findActive(
      executor,
      userId,
      capability,
      roomId,
    );
    this.assertRestrictionsAllowed(restrictions, capability, roomId);
  }

  assertRestrictionsAllowed(
    restrictions: ActiveRestriction[],
    capability: Capability,
    roomId?: string,
  ): void {
    const restriction = restrictions.find(
      (candidate) =>
        candidate.capability === capability &&
        (!roomId || !candidate.roomId || candidate.roomId === roomId),
    );
    if (!restriction) return;

    throw apiError(
      HttpStatus.FORBIDDEN,
      "CAPABILITY_RESTRICTED",
      `Action is restricted. Reason: ${restriction.reason}`,
      {
        restrictionId: restriction.id,
        capability: restriction.capability,
        roomId: restriction.roomId,
        reason: restriction.reason,
        startsAt: restriction.startsAt,
        expiresAt: restriction.expiresAt,
      },
    );
  }

  private async findActive(
    executor: SqlExecutor,
    userId: string,
    capability?: Capability,
    roomId?: string,
  ): Promise<ActiveRestriction[]> {
    const result = await executor.query<{
      id: string;
      capability: Capability;
      room_id: string | null;
      reason: string;
      starts_at: Date;
      expires_at: Date | null;
    }>(
      `
        select id, capability, room_id, reason, starts_at, expires_at
        from user_restrictions
        where user_id = $1
          and revoked_at is null
          and starts_at <= now()
          and (expires_at is null or expires_at > now())
          and ($2::text is null or capability = $2)
          and (
            $3::uuid is null
            or room_id is null
            or room_id = $3
          )
        order by starts_at desc
      `,
      [userId, capability ?? null, roomId ?? null],
    );

    return result.rows.map((row) => ({
      id: row.id,
      capability: row.capability,
      roomId: row.room_id,
      reason: row.reason,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
    }));
  }
}
