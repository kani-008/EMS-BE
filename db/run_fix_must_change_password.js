// db/run_fix_must_change_password.js
// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME FIX: The original alter migration added must_change_password with
// DEFAULT TRUE, which PostgreSQL applied retroactively to every pre-existing
// row. This script corrects that:
//
//   1. Changes the column default to FALSE (so new rows that aren't explicitly
//      set — e.g. an admin account — get FALSE, not TRUE).
//   2. Backfills all currently-existing rows to FALSE, because their passwords
//      were already intentional — they should NOT be forced through a
//      password-change flow they were never warned about.
//
// This does NOT affect the explicit `must_change_password = true` sets in
// staffController/studentController for newly system-generated passwords.
// Those lines are untouched; the feature still works for new accounts.
// ─────────────────────────────────────────────────────────────────────────────

const { Pool } = require("pg");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
});

async function runFix() {
  const client = await pool.connect();
  try {
    console.log("==> Starting must_change_password fix...");

    await client.query("BEGIN");

    // Step 1: Change the column default to FALSE going forward
    console.log("==> Step 1: Setting column default to FALSE...");
    await client.query(`
      ALTER TABLE credentials.table_login
        ALTER COLUMN must_change_password SET DEFAULT FALSE;
    `);

    // Step 2: Backfill all existing rows that are TRUE or NULL
    //         (the bad DEFAULT TRUE was applied to all pre-existing rows)
    const { rowCount } = await client.query(`
      UPDATE credentials.table_login
        SET must_change_password = FALSE
        WHERE must_change_password IS DISTINCT FROM FALSE;
    `);
    console.log(`==> Step 2: Backfilled ${rowCount} row(s) to must_change_password = FALSE`);

    await client.query("COMMIT");
    console.log("✅ Fix applied successfully.");

    // Validation: confirm seed accounts are now correct
    const { rows: check } = await client.query(`
      SELECT user_name, must_change_password
        FROM credentials.table_login
        WHERE user_name IN ('admin1', 'vasuki', 'student001')
        ORDER BY user_name;
    `);
    if (check.length > 0) {
      console.log("\n📋 Seed account validation:");
      check.forEach((r) =>
        console.log(`   ${r.user_name}: must_change_password = ${r.must_change_password}`)
      );
    } else {
      console.log("\nℹ️  None of the named seed accounts found (admin1/vasuki/student001) — check your dataset.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Fix failed — rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runFix();
