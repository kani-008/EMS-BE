
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
  quiet: true,
});

const { DATABASE_URL, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

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

pool.on("connect", (client) => {
  client
    .query("SET search_path TO credentials, event_management, public")
    .catch((err) => console.warn("⚠ search_path set failed on new connection:", err.message));
});

pool.on("error", (err) => {
  console.error("❌ Unexpected Postgres pool error:", err.message);
});


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
  const client = await pool.connect();
  await client.query("SELECT 1");
  client.release();
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