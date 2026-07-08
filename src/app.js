// backend/src/app.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const express = require("express");
const cors    = require("cors");
const cookieParser = require("cookie-parser");
const { connectDB } = require("./config/db");

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ["http://localhost:5175", "http://localhost:5176", "http://localhost:5173", "http://localhost:5174"],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
// NOTE: this now correctly matches the actual folder name `src/routes`
// (lowercase). The original repo had this require pointing at "./routes/..."
// while the folder on disk was "src/Routes/" (capital R) — that only works
// on case-insensitive filesystems (Windows/Mac). On Linux (any real
// deployment target, including this one) it throws MODULE_NOT_FOUND and the
// server never boots. Fixed by standardizing on lowercase `routes/` here.
const authRoutes    = require("./routes/auth.routes");
const studentRoutes = require("./routes/student.routes");
const staffRoutes   = require("./routes/staff.routes");
const adminRoutes   = require("./routes/admin.routes");

app.use("/api/auth",    authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/staff",   staffRoutes);
app.use("/api/admin",   adminRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send("Backend is running 🚀 (Node.js + Express + PostgreSQL stack)"));

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("💥 Unhandled error:", err.message);
  res.status(500).json({ message: "Internal server error" });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "5000", 10);

connectDB().then(() => {
  app.listen(PORT, () =>
    console.log(`🚀 Server listening on port ${PORT}`)
  );
});
