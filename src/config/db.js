// Force IPv4 resolution first — Supabase pooler hostnames sometimes resolve
// an IPv6 address that isn't actually routable from every network/container,
// which shows up as intermittent ETIMEDOUT connection failures. This is a
// well-known real fix for exactly that class of Supabase + Node issue.
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const { Pool } = require("pg");
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const { DATABASE_URL, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

// Fail fast and loud instead of limping along and failing confusingly later
// on the first query.
if (!DATABASE_URL && (!DB_HOST || !DB_PORT || !DB_USER || !DB_PASSWORD || !DB_NAME)) {
  console.error("CRITICAL: Set DATABASE_URL, or all of DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.");
  process.exit(1);
}

const sslConfig = process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false };

const poolConfig = DATABASE_URL
  ? {
      connectionString: DATABASE_URL,
      ssl: sslConfig,
      max: parseInt(process.env.DB_POOL_MAX || "10", 10),
      connectionTimeoutMillis: 15000,
    }
  : {
      host: DB_HOST,
      port: parseInt(DB_PORT, 10),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      ssl: sslConfig,
      max: parseInt(process.env.DB_POOL_MAX || "10", 10),
      connectionTimeoutMillis: 15000,
    };

const pool = new Pool(poolConfig);

// Pin search_path on every new connection so unqualified table/function names
// (table_login, user_faculty, sp_login_user, ...) resolve correctly across
// both the credentials and event_management schemas, regardless of what the
// Supabase project's default search_path is. Fire-and-forget with a warning
// on failure so a transient error here doesn't surface as an unhandled
// rejection and take down the pool.
pool.on("connect", (client) => {
  client
    .query("SET search_path TO credentials, event_management, public")
    .catch((err) => console.warn("⚠ search_path set failed on new connection:", err.message));
});

pool.on("error", (err) => {
  console.error("❌ Unexpected Postgres pool error:", err.message);
});

/**
 * callProcedure — calls a Postgres function that RETURNS TABLE(...) and/or
 * has OUT parameters. A single `SELECT * FROM proc_name($1,$2,...)` gets
 * everything back in one round trip.
 */
function assertValidProcedureName(procName) {
  if (typeof procName !== "string" || !/^[A-Za-z0-9_]+$/.test(procName)) {
    throw new Error("Invalid stored procedure name");
  }
}

async function callProcedure(pool, procName, params = []) {
  assertValidProcedureName(procName);
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `SELECT * FROM ${procName}(${placeholders})`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

const connectDB = async () => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("✅ Connected to Supabase (credentials + event_management schemas)");
  } catch (err) {
    console.error("❌ Postgres connection failed:", err.message);
    console.error("Check DATABASE_URL / DB_HOST / DB_PASSWORD and that the project is not paused.");
    process.exit(1);
  }
};

// authPool and eventPool are kept as two exported names purely so the
// existing controller/service files don't need to change — they both just
// point at the same single pool now (credentials + event_management are
// schemas in one Supabase database, not two separate databases).
module.exports = {
  authPool: pool,
  eventPool: pool,
  pool,
  connectDB,
  callProcedure,
};