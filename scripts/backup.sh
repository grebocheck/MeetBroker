#!/bin/sh
set -eu

usage() {
  echo "Usage: scripts/backup.sh <destination-directory>" >&2
  exit 64
}

[ "$#" -eq 1 ] || usage
[ -n "$1" ] || usage

destination=$1
case "$destination" in
  / | . | ..) echo "Choose a dedicated backup destination" >&2; exit 64 ;;
esac

mkdir -p -- "$destination"
destination=$(cd "$destination" && pwd -P)
timestamp=$(date -u "+%Y%m%dT%H%M%SZ")
backup_directory="$destination/meetbroker-backup-$timestamp"

if [ -e "$backup_directory" ]; then
  echo "Backup target already exists: $backup_directory" >&2
  exit 73
fi

mkdir -m 700 -- "$backup_directory"
complete=false
cleanup() {
  if [ "$complete" != true ]; then
    rm -rf -- "$backup_directory"
  fi
}
trap cleanup EXIT HUP INT TERM

echo "Creating PostgreSQL backup..."
docker compose exec -T postgres sh -c \
  'exec pg_dump --format=custom --compress=9 --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "$backup_directory/database.dump"

echo "Creating uploads backup..."
docker compose exec -T api sh -c \
  'exec tar -C /app/storage/uploads -czf - .' \
  > "$backup_directory/uploads.tar.gz"

{
  echo "created_at=$timestamp"
  echo "git_commit=$(git rev-parse --verify HEAD 2>/dev/null || echo unknown)"
  echo "compose_project=meetbroker"
  echo "database_format=postgresql-custom"
  echo "uploads_path=/app/storage/uploads"
} > "$backup_directory/metadata.env"

(
  cd "$backup_directory"
  sha256sum database.dump uploads.tar.gz metadata.env > SHA256SUMS
)
chmod 600 "$backup_directory"/*

complete=true
trap - EXIT HUP INT TERM
echo "Backup created: $backup_directory"
echo "Validate with: (cd '$backup_directory' && sha256sum -c SHA256SUMS)"
