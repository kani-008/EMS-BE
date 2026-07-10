// backend/src/app.js
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const express = require("express");
const cors    = require("cors");
const cookieParser = require("cookie-parser");
const { connectDB } = require("./src/config/db");

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
const defaultOrigins = [
  "http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176",
  "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175", "http://127.0.0.1:5176"
];
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map(url => url.trim())
  : defaultOrigins;

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const authRoute       = require("./src/routes/authRoute");
const departmentRoute = require("./src/routes/departmentRoute");
const roleRoute       = require("./src/routes/roleRoute");
const staffRoute      = require("./src/routes/staffRoute");
const studentRoute    = require("./src/routes/studentRoute");
const userRoute       = require("./src/routes/userRoute");
const profileRoute    = require("./src/routes/profileRoute");

app.use("/api/auth",        authRoute);
app.use("/api/departments", departmentRoute);
app.use("/api/roles",       roleRoute);
app.use("/api/staff",       staffRoute);
app.use("/api/students",    studentRoute);
app.use("/api/users",       userRoute);
app.use("/api/profile",     profileRoute);

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
