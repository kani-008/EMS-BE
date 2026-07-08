#!/usr/bin/env bash
# db/run_migrations.sh
# Creates both Postgres databases (if they don't exist) and applies the
# schema + all functions, in order.
#
# Usage:
#   PGUSER=postgres PGPASSWORD=yourpass PGHOST=localhost ./run_migrations.sh
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" credentials 2>/dev/null || true
createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" event_management 2>/dev/null || true

echo "==> credentials: schema"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d credentials -f "$SCRIPT_DIR/schema/001_credentials_schema.sql"

echo "==> credentials: functions"
for f in "$SCRIPT_DIR"/functions/credentials/*.sql; do
  echo "   -> $f"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d credentials -f "$f"
done

echo "==> event_management: schema"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d event_management -f "$SCRIPT_DIR/schema/002_event_management_schema.sql"

echo "==> event_management: functions"
# f_ensure_student_table must load before anything that calls it
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d event_management -f "$SCRIPT_DIR/functions/event_management/f_ensure_student_table.sql"
for f in "$SCRIPT_DIR"/functions/event_management/*.sql; do
  [ "$(basename "$f")" = "f_ensure_student_table.sql" ] && continue
  echo "   -> $f"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d event_management -f "$f"
done

echo "✅ Done. Both databases are schema-complete."
