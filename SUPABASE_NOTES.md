# EMS-BE: Supabase Deployment Notes

This supersedes the two-separate-Postgres-databases version of the migration
with a single-Supabase-project, two-schema version. Read this alongside
`MIGRATION_NOTES.md` (bug fixes etc. still apply) — this file covers only
what's different for Supabase.

## Why two schemas instead of two databases

A Supabase project is one Postgres database. The original architecture
(mirroring your MySQL setup) used two separate databases — `credentials`
and `event_management` — so they'd need two Supabase projects to keep that
exactly. Instead, we put them in the **same** database as two schemas:
`credentials.*` and `event_management.*`.

This is actually a more faithful translation of the original MySQL code than
using two separate Postgres databases would have been: MySQL's
"databases" on one server can join each other directly (that's how the
original `sp_get_all_credentials` and `sp_get_user_by_username` procedures
joined `table_login` with `user_role` in one query) — which is exactly how
Postgres schemas in one database behave, and exactly how separate Postgres
*databases* do **not** behave. So this version restores those real joins
instead of working around them in the app layer.

## Getting your Supabase connection string

Supabase dashboard → your project → **Project Settings → Database →
Connection string**. Use the **Session pooler** or **direct connection**
(port 5432), not the **Transaction pooler** (port 6543) — this app creates
each department's student table dynamically the first time it's needed
(`sp_ensure_student_table`), and transaction-mode pgbouncer doesn't reliably
support DDL issued mid-session.

## Deploying the schema

```bash
cd db
chmod +x run_migrations.sh
DATABASE_URL="postgresql://postgres.xxxx:yourpassword@aws-0-region.pooler.supabase.com:5432/postgres" \
  ./run_migrations.sh
```

This creates the `credentials` and `event_management` schemas (plus a
shared `public.set_last_updated_on()` trigger function) and loads all 24
functions, in the right order, into your existing Supabase database — no
`createdb` needed since Supabase already gives you one.

## Backend setup

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET
npm run dev
```

`src/config/db.js` now creates **one** `pg` Pool (with `ssl` on by default,
since Supabase requires it) instead of two. `authPool` and `eventPool` are
still both exported, and still both work everywhere they're used in the
service layer — they just point at the same pool now. Every connection in
that pool has its `search_path` set to `credentials, event_management,
public`, so all the existing unqualified table/function names
(`table_login`, `user_faculty`, `sp_login_user`, ...) keep resolving
correctly without every call site needing to become `schema.table`.

## What changed vs. the two-database version

- **`sp_login_user`** now resolves the role name in the same query (real
  join to `event_management.user_role`, falling back to
  `credentials.table_role` for ADMIN) instead of a second lookup after
  login. `auth.service.js` is simpler as a result.
- **`sp_get_all_credentials`** does a real join to `event_management.user_role`
  again, returning `user_role_name` directly — `admin.service.js`'s
  `getUsersService` no longer needs to fetch roles separately and merge them
  in JS.
- **`sp_get_user_by_username`** does a real join back to
  `credentials.table_login`, so `status` comes back correctly populated
  instead of always `NULL`.
- **`db.js`** is one pool, not two.

## One thing to watch for if you add new tables later

Because `search_path` includes both schemas, an unqualified `CREATE TABLE
foo (...)` from a migration or ad-hoc script will land in whichever schema
is *first* in the search path (`credentials`) if not explicitly qualified.
Every place in this codebase that creates something (the schema files, and
`sp_ensure_student_table`'s dynamic `CREATE TABLE`) explicitly writes
`event_management.foo` or `credentials.foo` for exactly this reason — keep
doing that for anything new.

## Verified before delivery

Same as the previous pass: installed Postgres locally, created a single
database, ran `run_migrations.sh` against it end to end with zero errors,
then exercised the functions directly — including the three restored real
joins (`sp_login_user`, `sp_get_all_credentials`, `sp_get_user_by_username`)
and the full staff → student creation flow across both schemas — and
finally booted the actual `backend/` app against it and hit `/api/auth/login`
over HTTP for `admin1` and `vasuki`, confirming roles resolve correctly
(`"role":"ADMIN"`, `"role":"ADVISOR"`) through the whole stack.
