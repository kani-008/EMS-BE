const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('==> Altering credentials.table_login');
    await client.query(`
      ALTER TABLE credentials.table_login
      ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE;
    `);

    console.log('==> Altering event_management.user_faculty');
    await client.query(`
      ALTER TABLE event_management.user_faculty
      ALTER COLUMN department_id DROP NOT NULL;
    `);

    console.log('✅ Alter migrations completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
