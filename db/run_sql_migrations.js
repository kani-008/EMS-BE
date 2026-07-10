// db/run_sql_migrations.js
// Deploys all stored-procedure / function SQL files to Supabase.
// Safe to re-run — every file uses CREATE OR REPLACE FUNCTION (or DROP IF EXISTS first).
// Run order: credentials SPs first (login depends on them), then event_management SPs.

const { Pool } = require("pg");
const fs   = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
});

async function applySQL(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  console.log(`==> Applying: ${path.relative(path.resolve(__dirname, ".."), filePath)}`);
  await pool.query(sql);
}

const CREDENTIALS_DIR    = path.resolve(__dirname, "functions/credentials");
const EVENT_MGMT_DIR     = path.resolve(__dirname, "functions/event_management");

// Explicit ordered list — dependencies first (login_user after insert_login, etc.)
const CREDENTIALS_FILES = [
  "f_insert_login.sql",
  "f_rollback_login.sql",
  "f_rollback_logins.sql",
  "f_get_all_credentials.sql",
  "f_get_credentials_role_name.sql",
  "f_login_user.sql",             // depends on table_role + user_role via JOIN
  "f_insert_refresh_token.sql",
  "f_get_refresh_token.sql",
  "f_revoke_refresh_token.sql",
];

const EVENT_MGMT_FILES = [
  "f_get_departments.sql",
  "f_get_department_id_by_name.sql",
  "f_get_role_id_by_name.sql",
  "f_get_role_name_by_id.sql",
  "f_get_staff_roles.sql",        // ← was missing; caused getStaffRoles 500 errors
  "f_get_academic_year_by_batch.sql",
  "f_validate_batch_and_year.sql",
  "f_get_advisor_context.sql",
  "f_get_advisor_students.sql",
  "f_get_all_users.sql",
  "f_get_filter_options.sql",
  "f_get_user_by_username.sql",
  "f_get_staff_profile.sql",
  "f_update_staff_profile.sql",
  "f_create_staff_user.sql",
  "f_update_staff_user.sql",
  "f_bulk_create_staff.sql",
  "f_ensure_student_table.sql",
  "f_get_student_profile.sql",
  "f_update_student_profile.sql",
  "f_create_student.sql",
  "f_create_student_admin.sql",
  "f_update_student.sql",
  "f_promote_year_for_batch.sql",
];

async function run() {
  try {
    console.log("\n── Schema migrations ──────────────────────────────────────────");
    const schemaFile = path.resolve(__dirname, "schema/003_refresh_tokens.sql");
    if (fs.existsSync(schemaFile)) {
      await applySQL(schemaFile);
    }

    console.log("\n── Credentials functions ──────────────────────────────────────");
    for (const f of CREDENTIALS_FILES) {
      await applySQL(path.join(CREDENTIALS_DIR, f));
    }

    console.log("\n── Event-management functions ─────────────────────────────────");
    for (const f of EVENT_MGMT_FILES) {
      await applySQL(path.join(EVENT_MGMT_DIR, f));
    }

    console.log("\n✅ All SQL functions deployed successfully.");
  } catch (err) {
    console.error("❌ Failed to deploy SQL:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
