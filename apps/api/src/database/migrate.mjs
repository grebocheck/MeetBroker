import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import pg from "pg";

const { Client } = pg;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

function migrationsPath() {
  const sourcePath = resolve(scriptDirectory, "migrations");
  return existsSync(sourcePath)
    ? sourcePath
    : resolve(scriptDirectory, "../../../src/database/migrations");
}

async function migrationFiles(directory) {
  return (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

async function tableExists(client, table) {
  const result = await client.query(
    "select to_regclass($1) is not null as exists",
    [`public.${table}`]
  );
  return result.rows[0]?.exists ?? false;
}

async function legacyMigrations(client) {
  if (!(await tableExists(client, "schema_migrations"))) return [];
  const result = await client.query(
    "select name, checksum from schema_migrations order by name"
  );
  return result.rows;
}

async function verifyLegacyHistory(directory, files, applied) {
  for (const migration of applied) {
    if (!files.includes(migration.name)) {
      throw new Error(
        `Applied legacy migration ${migration.name} is missing from the repository`
      );
    }
    const sql = await readFile(resolve(directory, migration.name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (checksum !== migration.checksum) {
      throw new Error(`Applied legacy migration ${migration.name} was modified`);
    }
  }
}

function runnerOptions(client, directory) {
  return {
    dbClient: client,
    dir: directory,
    direction: "up",
    migrationsTable: "pgmigrations",
    checkOrder: true,
    singleTransaction: true,
    advisoryLockMode: "wait",
    migrationLoaderStrategies: [
      {
        extensions: [".sql"],
        loader: "legacySql"
      }
    ]
  };
}

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const directory = migrationsPath();
  const files = await migrationFiles(directory);
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(
      "select pg_advisory_lock(hashtext('meetbroker:migration-bootstrap'))"
    );
    const legacy = await legacyMigrations(client);
    await verifyLegacyHistory(directory, files, legacy);

    if (legacy.length && !(await tableExists(client, "pgmigrations"))) {
      const legacyNames = legacy.map((migration) => migration.name);
      const expectedNames = files.slice(0, legacy.length);
      if (legacyNames.some((name, index) => name !== expectedNames[index])) {
        throw new Error(
          "Legacy migration history is not a prefix of repository migrations"
        );
      }
      await runner({
        ...runnerOptions(client, directory),
        count: legacy.length,
        fake: true
      });
      process.stdout.write(
        `Baselined ${legacy.length} legacy migration(s): ${legacyNames
          .map((name) => basename(name))
          .join(", ")}\n`
      );
    }

    const applied = await runner(runnerOptions(client, directory));
    process.stdout.write(
      applied.length
        ? `Applied ${applied.length} migration(s)\n`
        : "Database schema is up to date\n"
    );
  } finally {
    await client
      .query(
        "select pg_advisory_unlock(hashtext('meetbroker:migration-bootstrap'))"
      )
      .catch(() => undefined);
    await client.end();
  }
}

migrate().catch((error) => {
  process.stderr.write(`${error?.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
