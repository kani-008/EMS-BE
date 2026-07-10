// db/run_add_admin_profile_fields.js
// ─────────────────────────────────────────────────────────────────────────────
// ADMIN accounts have no row in event_management.user_faculty (that table is
// for academic staff only), so ADMIN profile identity fields had nowhere to
// live. This adds first_name/last_name/gender directly onto
// credentials.table_login so ADMIN profiles can store and return real values.
// ─────────────────────────────────────────────────────────────────────────────

const { Pool } = require("pg");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("==> Altering credentials.table_login");
    await client.query(`
      ALTER TABLE credentials.table_login
      ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS last_name  VARCHAR(255),
      ADD COLUMN IF NOT EXISTS gender     VARCHAR(50);
    `);

    console.log("✅ Alter migration completed successfully.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
