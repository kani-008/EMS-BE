// backend/src/config/db.js
// Postgres version — replaces mysql2/promise with `pg`.
//
// Architecture unchanged from the MySQL version: two separate database
// connections (credentials, event_management), each its own Pool, because
// Postgres — like MySQL — cannot do cross-database queries/transactions
// without an extension (postgres_fdw/dblink). The distributed-rollback
// pattern in admin.service.js therefore stays exactly as it was: app-level
// compensation, not a real two-phase commit.
const { Pool } = require("pg");

function assertValidProcedureName(procName) {
  if (typeof procName !== "string" || !/^[A-Za-z0-9_]+$/.test(procName)) {
    throw new Error("Invalid stored procedure name");
  }
}

/**
 * callProcedure — calls a Postgres function that either RETURNS TABLE(...)
 * or has OUT parameters (or both). Either way, Postgres lets you call it as
 * a normal set-returning expression, so a single
 *   SELECT * FROM proc_name($1, $2, ...)
 * gets everything back in one round trip — no more two-step
 * "CALL proc(...,@out)" + "SELECT @out" dance that MySQL needed.
 */
async function callProcedure(pool, procName, params = []) {
  assertValidProcedureName(procName);
  const placeholders = params.map((_, i) => `$${i + 1}`).join(",");
  const sql = `SELECT * FROM ${procName}(${placeholders})`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * DB 1: Credentials (Authentication)
 */
const authPool = new Pool({
  host: process.env.AUTH_DB_HOST || "localhost",
  port: parseInt(process.env.AUTH_DB_PORT || "5432", 10),
  user: process.env.AUTH_DB_USER || "postgres",
  password: process.env.AUTH_DB_PASSWORD || "",
  database: process.env.AUTH_DB_NAME || "credentials",
  max: parseInt(process.env.AUTH_DB_POOL_MAX || "10", 10),
});

authPool.on("error", (err) => {
  console.error("❌ Unexpected Postgres authPool error:", err.message);
});

/**
 * DB 2: Event_Management (Academic & Operational Data)
 */
const eventPool = new Pool({
  host: process.env.EVENT_DB_HOST || "localhost",
  port: parseInt(process.env.EVENT_DB_PORT || "5432", 10),
  user: process.env.EVENT_DB_USER || "postgres",
  password: process.env.EVENT_DB_PASSWORD || "",
  database: process.env.EVENT_DB_NAME || "event_management",
  max: parseInt(process.env.EVENT_DB_POOL_MAX || "10", 10),
});

eventPool.on("error", (err) => {
  console.error("❌ Unexpected Postgres eventPool error:", err.message);
});

/**
 * connectDB — Verify both Postgres pools can reach their databases at startup.
 */
const connectDB = async () => {
  try {
    const authClient = await authPool.connect();
    await authClient.query("SELECT 1");
    authClient.release();
    console.log("✅ Auth DB (credentials) connected");

    const eventClient = await eventPool.connect();
    await eventClient.query("SELECT 1");
    eventClient.release();
    console.log("✅ Event DB (event_management) connected");
  } catch (err) {
    console.error("❌ Postgres connection failed:", err.message);
    console.error("Ensure both databases are running and credentials are correct.");
    process.exit(1);
  }
};

module.exports = { authPool, eventPool, connectDB, callProcedure };
