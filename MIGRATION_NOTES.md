# EMS-BE: MySQL → PostgreSQL Migration Notes

> **Deploying to Supabase?** See `SUPABASE_NOTES.md` — it supersedes the
> "How to run" section below with the single-database, two-schema setup and
> explains what's different (a few functions got real joins restored).
> Everything else on this page (the bug fixes, architecture rationale) still
> applies.

## How to run (local Postgres, two separate databases)

This section describes the original two-Postgres-databases version of the
migration. If you're deploying to Supabase, use `SUPABASE_NOTES.md` instead.


```bash
cd db
chmod +x run_migrations.sh
PGUSER=postgres PGPASSWORD=yourpass PGHOST=localhost ./run_migrations.sh
```

This creates the `credentials` and `event_management` databases and loads the
schema + all functions in the right order.

Backend:
```bash
cd backend
npm install          # pg replaces mysql2 in package.json
cp .env.example .env # fill in your local DB creds
npm run dev
```

---

## Real bugs found in the MySQL codebase and fixed here

1. **ROLE_MAP was backwards.** `auth.service.js` and `auth.middleware.js` both
   hardcoded `R06 → "ADMIN"`, `R08 → "SPORTS"`. The actual DB data (and the
   credentials seed data) has it the other way: **R08 = ADMIN** (in
   `credentials.table_role`), **R06 = PLACEMENT** (in
   `event_management.user_role`). Every admin login was being tagged
   `"SPORTS"`, and role-gated routes (`allowRoles("ADMIN")`) would have
   rejected real admins and let placement staff into ADMIN-only endpoints depending
   on how the two hardcoded maps interacted with real data.

   **Fix:** role name is resolved from the database at login
   (`sp_get_role_name_by_id` in event_management, falling back to
   `sp_get_credentials_role_name` in credentials for ADMIN), signed into the
   JWT once, and `auth.middleware.js` now trusts that signed value on every
   request instead of re-deriving it from a hardcoded table.

2. **Two different dynamic-table naming schemes were both live at once.**
   `sp_create_student_user` (called from `admin.service.js` via
   `/api/admin/create-users`) wrote students into `user_student_<dept>`.
   `sp_create_student` (called from `modules/staff/staff.service.js` via
   `/api/staff/...`) wrote into `user_student_<batch>_<dept>`. Meanwhile
   `sp_get_advisor_students`, `sp_update_student`, and
   `sp_promote_year_for_batch` all looked in the `<batch>_<dept>` scheme.
   Depending on which endpoint an advisor used to create students, their
   students could be invisible to "view my students" or "promote year".

   **Fix (per your instruction to keep the dynamic-table pattern):**
   standardized every function on **one** name —
   `user_student_<lowercase department name>` — with `batch` kept as an
   ordinary filterable column inside that table, not encoded in the table
   name. `sp_create_student_user` and `sp_create_student` were merged into
   one function (`f_create_student.sql`); both `admin.service.js` and
   `staff.service.js` now call it.

3. **`sp_ensure_student_table` and `sp_rollback_login(s)` were called by the
   Node code but didn't exist anywhere in `db/procedures/`.** These functions
   are implemented for real in this migration
   (`f_ensure_student_table.sql`, `f_rollback_login.sql`,
   `f_rollback_logins.sql`).

4. **`app.js` required `./routes/...` (lowercase) while the folder on disk
   was `src/Routes/` (capital R).** Works on case-insensitive filesystems
   (Windows/Mac dev machines), fails with `MODULE_NOT_FOUND` on any
   case-sensitive Linux deployment. Fixed by standardizing on lowercase
   `src/routes/`.

## Architecture notes for the Postgres version

- **Two databases, two pools — unchanged.** Postgres, like MySQL, can't do
  cross-database joins or transactions without an extension
  (`postgres_fdw`/`dblink`), so the two-pool, app-level-rollback design stays
  exactly as it was. `config/db.js` just swaps `mysql2` for `pg`.
- **`sp_get_all_credentials` no longer joins to `event_management.user_role`.**
  The MySQL version could do this because both "databases" were schemas on
  the same MySQL server instance. Real, separate Postgres databases can't.
  `admin.service.js`'s `getUsersService` now fetches role names from
  `event_management` separately and joins them in JS (the pattern the rest
  of that file already used for merging credentials + faculty data).
- **OUT-parameter calling convention is simpler now.** MySQL needed
  `CALL proc(...,@out)` followed by `SELECT @out` in a second query.
  Postgres functions with `OUT` parameters return everything from one
  `SELECT * FROM proc_name($1,$2,...)` — `config/db.js`'s `callProcedure`
  does exactly that uniformly for every function, whether it has OUT params,
  returns a table, or both.
- **`sp_create_student_user`'s signature no longer takes `p_department_id`
  as an input.** It's now derived purely from the advisor's own
  `user_faculty` row, so a student's department can no longer be spoofed
  from the client — the department-mismatch check that used to compare an
  incoming param against the advisor's row is now structurally impossible to
  bypass, since there's no incoming param to mismatch.

## What's included beyond the original MySQL DDL

The Excel schema you provided lists `course`, `event_level`, `event_organizer`,
`request_type`, `progress_status`, `request_main`, `request_events`, and
`request_progress` — these existed only as commented-out DDL in the MySQL
repo. They're live tables in `002_event_management_schema.sql` now (with seed
data for the lookup tables), so the database is schema-complete per your
Excel doc. **No backend service layer touches them yet** — that's request/
event management, which you mentioned is on the roadmap after user
management. Let me know when you want that wired up.

## What was deliberately NOT migrated

- **`src/services/user.service.js`** calls `sp_create_user`, `sp_get_users`,
  `sp_update_user_status`, `sp_delete_user` — none of which exist anywhere in
  the MySQL `db/procedures/` either, and nothing in `app.js`/routes requires
  this file. It's dead code, not wired to any route. I left it out of the
  migration rather than porting functions that don't do anything; let me
  know if there's a route I'm missing that actually uses it.
- **Frontend (EMS-FE)** — untouched. Since the API contract (request/response
  shapes) is unchanged, no frontend changes should be needed for this pass.

## Known pre-existing inconsistency (not fixed, flagging only)

`user_faculty.department_id` is `NOT NULL` (with a foreign key) in both the
old MySQL schema and this Postgres one, but `sp_create_staff_user` explicitly
supports `department_id = NULL` for the PRINCIPAL role, and
`sp_bulk_create_staff` falls back to `department_id = 0` (which fails the FK
since there's no department 0). This was already inconsistent before the
migration. If PRINCIPAL is meant to have no department, `department_id`
should become nullable — say the word and I'll change it; didn't want to
alter your data model on my own judgment call.

## Files in this delivery

```
db/
  schema/001_credentials_schema.sql
  schema/002_event_management_schema.sql
  functions/credentials/*.sql        (6 functions)
  functions/event_management/*.sql   (18 functions)
  run_migrations.sh
backend/
  package.json                       (mysql2 -> pg)
  .env.example
  src/app.js                         (routes casing fixed)
  src/config/db.js                   (pg Pool + new callProcedure)
  src/middleware/auth.middleware.js  (DB-driven role trust, no hardcoded map)
  src/controllers/auth.controller.js (pg row access)
  src/controllers/admin.controller.js         (unchanged, copied)
  src/controllers/staff.controller.js         (unchanged, copied)
  src/modules/staff/staff.controller.js       (unchanged, copied)
  src/modules/staff/staff.routes.js           (unchanged, copied)
  src/modules/staff/staff.service.js          (rewritten for pg + unified create-student)
  src/modules/students/student.controller.js  (unchanged, copied)
  src/modules/students/student.routes.js      (unchanged, copied)
  src/modules/students/student.service.js     (rewritten for pg)
  src/services/auth.service.js       (rewritten: DB-driven roles)
  src/services/admin.service.js      (rewritten for pg)
  src/routes/*.routes.js             (copied into correctly-cased folder)
```

## Suggested next steps (P1 continuation)

1. Point your local `.env` at a real Postgres instance and run
   `db/run_migrations.sh`.
2. `npm install && npm run dev` in `backend/`, smoke-test login for all three
   seeded accounts (`vasuki`/advisor, `admin1`/admin, `student001`/student) —
   this is the best way to confirm the role-mapping fix actually works
   end-to-end.
3. Exercise the student-creation flow through both `/api/admin/create-users`
   and `/api/staff/...` and confirm they now land in the same table.
4. Once confirmed, we can move to Request Management / Reports on the
   backend, wiring up the `request_main`/`request_events`/`request_progress`
   tables that are now schema-complete but service-less.
