#!/usr/bin/env bash
# db/run_migrations.sh
# Applies the schema + all functions to your Supabase Postgres database, in
# order. Unlike the earlier two-database version of this script, there's no
# createdb step — Supabase already gives you one "postgres" database; this
# just creates the two schemas inside it and loads everything.
#
# Usage:
#   DATABASE_URL="postgresql://postgres.xxxx:pass@aws-0-region.pooler.supabase.com:5432/postgres" \
#     ./run_migrations.sh
#
# Get DATABASE_URL from: Supabase dashboard -> Project Settings -> Database
# -> Connection string. Use the direct connection or session pooler (port
# 5432), not the transaction pooler (6543) — this schema creates tables
# dynamically at request time and transaction-mode pgbouncer doesn't handle
# that well.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to your Supabase connection string first}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Creating schemas + shared trigger function"
psql "$DATABASE_URL" -f "$SCRIPT_DIR/schema/000_schemas.sql"

echo "==> credentials schema: tables"
psql "$DATABASE_URL" -f "$SCRIPT_DIR/schema/001_credentials_schema.sql"

echo "==> event_management schema: tables"
psql "$DATABASE_URL" -f "$SCRIPT_DIR/schema/002_event_management_schema.sql"

echo "==> credentials: functions"
for f in "$SCRIPT_DIR"/functions/credentials/*.sql; do
  echo "   -> $f"
  psql "$DATABASE_URL" -f "$f"
done

echo "==> event_management: functions"
# f_ensure_student_table must load before anything that calls it
psql "$DATABASE_URL" -f "$SCRIPT_DIR/functions/event_management/f_ensure_student_table.sql"
for f in "$SCRIPT_DIR"/functions/event_management/*.sql; do
  [ "$(basename "$f")" = "f_ensure_student_table.sql" ] && continue
  echo "   -> $f"
  psql "$DATABASE_URL" -f "$f"
done

echo "✅ Done. credentials + event_management schemas are live in your Supabase database."
