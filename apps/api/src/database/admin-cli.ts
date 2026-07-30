import { randomUUID } from "node:crypto";
import { Client } from "pg";

type AdminCommand = "promote" | "demote" | "revoke" | "restore";

interface UserRow {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  email_verified_at: Date | null;
  approved_at: Date | null;
  access_revoked_at: Date | null;
}

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  admin-cli promote <email>",
      "  admin-cli demote <email>",
      "  admin-cli revoke <email> <reason>",
      "  admin-cli restore <email>",
    ].join("\n"),
  );
}

async function assertAnotherActiveAdmin(
  client: Client,
  userId: string,
): Promise<void> {
  await client.query(
    "select pg_advisory_xact_lock(hashtext('admin-cli-role-management'))",
  );
  const result = await client.query<{ count: string }>(
    `
      select count(*)::text as count
      from users
      where role = 'ADMIN'
        and access_revoked_at is null
        and id <> $1
    `,
    [userId],
  );
  if (Number(result.rows[0]?.count ?? 0) < 1) {
    throw new Error("The last active administrator cannot be changed");
  }
}

async function audit(
  client: Client,
  action: string,
  userId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `
      insert into audit_logs
        (id, actor_id, action, target_type, target_id, details)
      values ($1, null, $2, 'USER', $3, $4::jsonb)
    `,
    [
      randomUUID(),
      action,
      userId,
      JSON.stringify({ ...details, source: "CLI" }),
    ],
  );
}

async function run(): Promise<void> {
  const command = process.argv[2] as AdminCommand | undefined;
  const email = process.argv[3]?.trim().toLowerCase();
  const reason = process.argv.slice(4).join(" ").trim();
  if (
    !command ||
    !["promote", "demote", "revoke", "restore"].includes(command) ||
    !email
  ) {
    usage();
  }
  if (command === "revoke" && reason.length < 3) {
    throw new Error("A revoke reason of at least 3 characters is required");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("begin");
    const users = await client.query<UserRow>(
      `
        select
          id, email, role, email_verified_at, approved_at, access_revoked_at
        from users
        where lower(email) = $1
        for update
      `,
      [email],
    );
    const user = users.rows[0];
    if (!user) throw new Error(`User ${email} was not found`);

    if (command === "promote") {
      if (
        !user.email_verified_at ||
        !user.approved_at ||
        user.access_revoked_at
      ) {
        throw new Error(
          "Only a verified, approved and active user can be promoted",
        );
      }
      if (user.role !== "ADMIN") {
        await client.query(
          "update users set role = 'ADMIN', updated_at = now() where id = $1",
          [user.id],
        );
        await audit(client, "USER_ROLE_CHANGED", user.id, { role: "ADMIN" });
      }
    }

    if (command === "demote" && user.role === "ADMIN") {
      await assertAnotherActiveAdmin(client, user.id);
      await client.query(
        "update users set role = 'USER', updated_at = now() where id = $1",
        [user.id],
      );
      await audit(client, "USER_ROLE_CHANGED", user.id, { role: "USER" });
    }

    if (command === "revoke" && !user.access_revoked_at) {
      if (user.role === "ADMIN") {
        await assertAnotherActiveAdmin(client, user.id);
      }
      await client.query(
        "update users set access_revoked_at = now(), updated_at = now() where id = $1",
        [user.id],
      );
      await client.query(
        "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
        [user.id],
      );
      await audit(client, "USER_ACCESS_REVOKED", user.id, { reason });
    }

    if (command === "restore" && user.access_revoked_at) {
      await client.query(
        "update users set access_revoked_at = null, updated_at = now() where id = $1",
        [user.id],
      );
      await audit(client, "USER_ACCESS_RESTORED", user.id, {});
    }

    await client.query("commit");
    process.stdout.write(
      `${command} completed for ${email}; previous role: ${user.role}\n`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
