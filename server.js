process.env.DOTENV_CONFIG_QUIET = "true";
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const os = require("os");

require("dotenv").config({
  path: require("path").resolve(__dirname, ".env"),
  quiet: true,
});

const { connectDB, authPool } = require("./src/config/db");

// ── Routes ──────────────────────────────────────────────────────────
const loginRoute = require("./src/routes/loginRoute");
const departmentRoute = require("./src/routes/departmentRoute");
const roleRoute = require("./src/routes/roleRoute");
const staffRoute = require("./src/routes/staffRoute");
const studentRoute = require("./src/routes/studentRoute");
const userRoute = require("./src/routes/userRoute");
const profileRoute = require("./src/routes/profileRoute");
const requestRoute = require("./src/routes/requestRoute");

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const HOST = "0.0.0.0"; // bind to all interfaces (required by every PaaS — Render, Railway, etc.)
const IS_PROD = process.env.NODE_ENV === "production";

// Trust the first proxy hop so req.ip / rate-limiting / secure-cookie detection
// see the real client correctly behind the platform's load balancer. Bump via
// TRUST_PROXY in env if you sit behind more than one proxy hop.
app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

// ── CORS ────────────────────────────────────────────────────────────
// Strip trailing slashes so "https://foo.com/" and "https://foo.com" both match.
const normalizeOrigin = (o) => o.trim().replace(/\/+$/, "");

const defaultDevOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
];

const ALLOWED_ORIGINS = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map(normalizeOrigin).filter(Boolean)
  : IS_PROD
    ? [] // production must set CLIENT_URL explicitly — fail closed, no silent localhost fallback
    : defaultDevOrigins;



app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server / curl / same-origin requests (no Origin header)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(normalizeOrigin(origin)))
        return cb(null, true);
      console.warn(`[cors] blocked origin '${origin}'`);
      cb(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true, // required — EMS uses an HttpOnly cookie for the JWT, not an Authorization header
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, // cache CORS preflight for a day — fewer OPTIONS round-trips in prod
  }),
);

// ── Body parsers with size caps ────────────────────────────────────
// EMS forms are small JSON payloads; Excel/CSV uploads go through multer
// separately in staffRoute/studentRoute and aren't affected by this limit.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(cookieParser());

// ── Health check ────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message:
      "EMS backend is running 🚀 (Node.js + Express + PostgreSQL/Supabase)",
    timestamp: new Date(),
  });
});

// ── API routes ──────────────────────────────────────────────────────
app.use("/api/auth", loginRoute); // login, refresh-token, logout, me
app.use("/api/departments", departmentRoute); // reference data
app.use("/api/roles", roleRoute); // reference data
app.use("/api/staff", staffRoute); // staff CRUD + profile + advisor-context
app.use("/api/students", studentRoute); // student CRUD (advisor self-service + admin-driven)
app.use("/api/users", userRoute); // unified admin+advisor user listing
app.use("/api/profile", profileRoute); // role-aware profile GET/PUT
app.use("/api/requests", requestRoute); // request management (create/list/status/delete)

// ── 404 ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Resource not found" });
});

// ── Global error handler ───────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ success: false, message: "Internal server error" });
});

// ── helper: find this machine's LAN IPv4 (e.g. 192.168.1.5) ────────
// Dev-only convenience — meaningless (and mildly leaky) on a cloud host.
function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

// ── Start ───────────────────────────────────────────────────────────
connectDB()
  .then(() => {
    const server = app.listen(PORT, HOST, () => {
      console.log("Ems backend server started successfully");
      console.log(`Local:   http://localhost:${PORT}`);
      console.log(`Network: http://${getLanIp()}:${PORT}   (same Wi-Fi)`);
      console.log("db connected successfully");
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(` Port ${PORT} is already in use.`);
      } else {
        console.error(" Server error:", err.message);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });

module.exports = app;
