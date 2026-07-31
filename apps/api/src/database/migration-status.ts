import "reflect-metadata";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Client } from "pg";

function migrationsPath(): string {
  const compiledPath = resolve(__dirname, "migrations");
  return existsSync(compiledPath)
    ? compiledPath
    : resolve(__dirname, "../../src/database/migrations");
}

async function status(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const files = (await readdir(migrationsPath()))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const historyExists = await client.query<{ exists: boolean }>(
      "select to_regclass('public.pgmigrations') is not null as exists",
    );
    const applied = historyExists.rows[0]?.exists
      ? (
          await client.query<{ name: string }>(
            "select name from pgmigrations order by run_on, id",
          )
        ).rows.map((row) => row.name)
      : [];

    for (const file of files) {
      const name = basename(file, ".sql");
      process.stdout.write(
        `${applied.includes(name) ? "[applied]" : "[pending]"} ${file}\n`,
      );
    }
    const knownNames = files.map((file) => basename(file, ".sql"));
    const unknown = applied.filter((name) => !knownNames.includes(name));
    for (const name of unknown) {
      process.stdout.write(`[missing] ${name}\n`);
    }
    if (unknown.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

status().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
