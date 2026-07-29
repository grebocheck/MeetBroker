import "reflect-metadata";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const sourceMigrationsPath = resolve(__dirname, "migrations");
  const migrationsPath = existsSync(sourceMigrationsPath)
    ? sourceMigrationsPath
    : resolve(__dirname, "../../src/database/migrations");
  const files = (await readdir(migrationsPath))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    for (const file of files) {
      const sql = await readFile(resolve(migrationsPath, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string }>(
        "select checksum from schema_migrations where name = $1",
        [file]
      );

      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration ${file} was modified`);
        }
        continue;
      }

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (name, checksum) values ($1, $2)",
          [file, checksum]
        );
        await client.query("commit");
        process.stdout.write(`Applied ${file}\n`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

migrate().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`
  );
  process.exitCode = 1;
});
