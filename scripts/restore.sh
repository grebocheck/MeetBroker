#!/bin/sh
set -eu

usage() {
  echo "Usage: MEETBROKER_RESTORE_CONFIRM=restore scripts/restore.sh <backup-directory>" >&2
  exit 64
}

[ "$#" -eq 1 ] || usage
[ "${MEETBROKER_RESTORE_CONFIRM:-}" = "restore" ] || {
  echo "Restore replaces the current database and uploads." >&2
  echo "Set MEETBROKER_RESTORE_CONFIRM=restore after verifying the target." >&2
  exit 77
}

backup_directory=$1
[ -d "$backup_directory" ] || {
  echo "Backup directory does not exist: $backup_directory" >&2
  exit 66
}
backup_directory=$(cd "$backup_directory" && pwd -P)

for file in database.dump uploads.tar.gz metadata.env SHA256SUMS; do
  [ -f "$backup_directory/$file" ] || {
    echo "Backup is incomplete: missing $file" >&2
    exit 65
  }
done

echo "Validating backup checksums..."
(cd "$backup_directory" && sha256sum -c SHA256SUMS)

echo "Validating archive formats..."
tar -tzf "$backup_directory/uploads.tar.gz" >/dev/null
docker compose up -d --wait postgres
docker compose exec -T postgres sh -c \
  'exec pg_restore --list' < "$backup_directory/database.dump" >/dev/null

echo "Stopping application and notification delivery..."
docker compose stop worker nginx api

echo "Replacing the PostgreSQL database..."
docker compose exec -T postgres sh -c \
  'dropdb --if-exists --force --username="$POSTGRES_USER" "$POSTGRES_DB" &&
   createdb --username="$POSTGRES_USER" "$POSTGRES_DB" &&
   exec pg_restore --exit-on-error --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  < "$backup_directory/database.dump"

echo "Replacing the uploads volume..."
docker compose run --rm -T --no-deps --entrypoint sh api -c \
  'find /app/storage/uploads -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + &&
   exec tar -C /app/storage/uploads -xzf -' \
  < "$backup_directory/uploads.tar.gz"

echo "Starting the application without external notification delivery..."
SEED_DEMO_DATA=false docker compose up -d --wait api nginx

echo "Restore completed. The worker remains stopped intentionally."
echo "Review pending/failed deliveries in Administration, then start it with:"
echo "  docker compose up -d worker"
