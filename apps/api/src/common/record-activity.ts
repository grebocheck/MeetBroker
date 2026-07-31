import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export async function recordActivity(
  client: PoolClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `
      insert into audit_logs
        (id, actor_id, action, target_type, target_id, details)
      values ($1, $2, $3, $4, $5, $6)
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
