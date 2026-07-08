// backend/src/config/db.js
// Supabase version — ONE Postgres database, two schemas (credentials,
// event_management) instead of the two-separate-Postgres-databases version
// of this migration.
//
// authPool and eventPool are kept as two exported names purely so none of
// the existing service-layer code (admin.service.js, staff.service.js,
// student.service.js, auth.service.js, ...) has to change — they both just
// point at the SAME underlying pool now. Every connection in that pool has
// its search_path set to look through both schemas, so all the existing
// unqualified table names (table_login, user_faculty, department, ...) and
// function names (sp_login_user, sp_get_departments, ...) keep resolving
// correctly without being rewritten schema.table everywhere. There's no
// name collision between the two schemas, so this is safe.
const { Pool } = require("pg");

function assertValidProcedureName(procName) {
  if (typeof procName !== "string" || !/^[A-Za-z0-9_]+$/.test(procName)) {
    throw new Error("Invalid stored procedure name");
  }
}

/**
 * callProcedure — calls a Postgres function that RETURNS TABLE(...) and/or
 * has OUT parameters. A single `SELECT * FROM proc_name($1,$2,...)` gets
 * everything back in one round trip.
 */
async function callProcedure(pool, procName, params = []) {
  assertValidProcedureName(procName);
  const placeholders = params.map((_, i) => `$${i + 1}`).join(",");
  const sql = `SELECT * FROM ${procName}(${placeholders})`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

// Supabase requires SSL. If you've downloaded Supabase's CA certificate you
// can pass it via ca: instead of disabling verification — rejectUnauthorized
// is set to false here to keep local setup simple; tighten this for
// production if you want full certificate validation.
const sslConfig = process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false };

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      max: parseInt(process.env.DB_POOL_MAX || "10", 10),
    }
  : {
      host:     process.env.DB_HOST || "localhost",
      port:     parseInt(process.env.DB_PORT || "5432", 10),
      user:     process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "postgres",
      ssl:      sslConfig,
      max:      parseInt(process.env.DB_POOL_MAX || "10", 10),
    };

const pool = new Pool(poolConfig);

// Pin search_path on every new connection so unqualified names resolve
// across both schemas regardless of what the Supabase project's default is.
pool.on("connect", (client) => {
  client.query("SET search_path TO credentials, event_management, public");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected Postgres pool error:", err.message);
});

// Kept as two names for compatibility with existing service-layer imports —
// both point at the same pool/database now.
const authPool = pool;
const eventPool = pool;

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

module.exports = { authPool, eventPool, connectDB, callProcedure };
