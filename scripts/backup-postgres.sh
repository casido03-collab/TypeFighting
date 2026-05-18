#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/typefight}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/typefight}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL="$(
  grep -m1 '^DATABASE_URL=' "$ENV_FILE" \
    | cut -d= -f2- \
    | tr -d '\r'
)"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not configured in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
backup_file="$BACKUP_DIR/typefight-$timestamp.dump"

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$backup_file"

gzip -f "$backup_file"

find "$BACKUP_DIR" \
  -type f \
  -name 'typefight-*.dump.gz' \
  -mtime +"$RETENTION_DAYS" \
  -delete

echo "Backup created: $backup_file.gz"
