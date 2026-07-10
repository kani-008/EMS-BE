const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});

async function applySQL(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`==> Applying SQL file: ${path.basename(filePath)}`);
  await pool.query(sql);
}

async function run() {
  try {
    await applySQL(path.resolve(__dirname, 'functions/credentials/f_login_user.sql'));
    await applySQL(path.resolve(__dirname, 'functions/event_management/f_bulk_create_staff.sql'));
    await applySQL(path.resolve(__dirname, 'functions/event_management/f_create_student_admin.sql'));
    await applySQL(path.resolve(__dirname, 'functions/event_management/f_get_all_users.sql'));
    console.log('✅ SQL files loaded successfully.');
  } catch (err) {
    console.error('❌ Failed to load SQL:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
