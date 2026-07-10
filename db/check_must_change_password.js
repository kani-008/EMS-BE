// db/check_must_change_password.js
// Quick check: what is must_change_password for seed accounts + any ADMIN with it = true?
const { Pool } = require("pg");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
});

async function check() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT user_name, user_role_id, must_change_password
         FROM credentials.table_login
         WHERE user_name IN ('admin1', 'vasuki', 'student001')
         ORDER BY user_name`
    );
    if (rows.length === 0) {
      console.log("ℹ️  None of the named seed accounts found (admin1/vasuki/student001).");
    } else {
      console.log("📋 Seed account must_change_password state:");
      rows.forEach((r) =>
        console.log(`   ${r.user_name} | role_id: ${r.user_role_id} | must_change_password: ${r.must_change_password}`)
      );
    }

    // Any ADMIN (user_role_id = 'R08') with must_change_password = true?
    const { rows: admins } = await client.query(
      `SELECT user_name, must_change_password
         FROM credentials.table_login
         WHERE user_role_id = 'R08' AND must_change_password = true`
    );
    if (admins.length > 0) {
      console.log("\n⚠️  ADMIN accounts currently locked by must_change_password = TRUE:");
      admins.forEach((r) => console.log(`   ${r.user_name}`));
      console.log("\n   Run:  node db/run_fix_must_change_password.js  to correct these.\n");
    } else {
      console.log("\n✅ No ADMIN accounts have must_change_password = TRUE. Fix already applied.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch((e) => {
  console.error("❌ Check failed:", e.message);
  process.exit(1);
});
