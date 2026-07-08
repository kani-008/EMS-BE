// backend/src/config/db.js
const mysql = require("mysql2/promise");

function assertValidProcedureName(procName) {
  if (typeof procName !== "string" || !/^[A-Za-z0-9_]+$/.test(procName)) {
    throw new Error("Invalid stored procedure name");
  }
}

async function callProcedure(pool, procName, params = []) {
  assertValidProcedureName(procName);
  const placeholders =
    params.length > 0 ? `(${params.map(() => "?").join(",")})` : "()";

  // IMPORTANT: Backend must ONLY call stored procedures (no direct SQL).
  const [rows] = await pool.query(`CALL ${procName}${placeholders}`, params);

  // mysql2 returns result sets for CALL as an array-of-arrays.
  // Normalize to: first result set rows (or []).
  if (Array.isArray(rows)) {
    if (Array.isArray(rows[0])) return rows[0];
    return rows;
  }
  return [];
}

/**
 * DB 1: Credentials (Authentication)
 * Used exclusively for user login credentials and role assignment.
 */
const authPool = mysql.createPool({
  host: process.env.AUTH_DB_HOST || "localhost",
  port: parseInt(process.env.AUTH_DB_PORT || "3306", 10),
  user: process.env.AUTH_DB_USER || "root",
  password: process.env.AUTH_DB_PASSWORD || "",
  database: process.env.AUTH_DB_NAME || "credentials",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});

authPool.on("error", (err) => {
  console.error("❌ Unexpected MySQL authPool error:", err.message);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    console.error("Database connection was closed.");
  }
  if (err.code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR") {
    console.error("Database had a fatal error.");
  }
});

/**
 * DB 2: Event_Management (Academic & Operational Data)
 * Used for student data, events, and all operational records.
 */
const eventPool = mysql.createPool({
  host: process.env.EVENT_DB_HOST || "localhost",
  port: parseInt(process.env.EVENT_DB_PORT || "3306", 10),
  user: process.env.EVENT_DB_USER || "root",
  password: process.env.EVENT_DB_PASSWORD || "",
  database: process.env.EVENT_DB_NAME || "event_management",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});

eventPool.on("error", (err) => {
  console.error("❌ Unexpected MySQL eventPool error:", err.message);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    console.error("Database connection was closed.");
  }
  if (err.code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR") {
    console.error("Database had a fatal error.");
  }
});

/**
 * connectDB — Verify both MySQL pools can reach their respective databases at startup.
 */
const connectDB = async () => {
  try {
    const authConnection = await authPool.getConnection();
    await authConnection.ping();
    authConnection.release();
    console.log(`✅ Auth DB (Credentials) connected`);

    const eventConnection = await eventPool.getConnection();
    await eventConnection.ping();
    eventConnection.release();
    console.log(`✅ Event DB (Event_Management) connected`);
  } catch (err) {
    console.error("❌ MySQL connection failed:", err.message);
    console.error("Ensure both databases are running and credentials are correct.");

    process.exit(1);
  }
};

module.exports = { authPool, eventPool, connectDB, callProcedure };
