// backend/src/controllers/auth.controller.js
const { authPool, eventPool, callProcedure } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

class AuthError extends Error {
  constructor(message, statusCode = 400, code = "AUTH_ERROR") {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isAuthDebugEnabled() {
  return String(process.env.AUTH_DEBUG || "").toLowerCase() === "true";
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "Strict" : "Lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  };
}

// Internal auth logic from auth.service.js
async function loginService(username, password) {
  const cleanUsername = String(username || "").trim();
  const cleanPassword = String(password || "");

  if (!cleanUsername || !cleanPassword) {
    throw new AuthError("Username and password are required", 400, "MISSING_FIELDS");
  }

  const rows = await callProcedure(authPool, "sp_login_user", [cleanUsername]);

  if (!rows || rows.length === 0) {
    throw new AuthError("Invalid username or password", 401, "INVALID_CREDENTIALS");
  }

  const user = rows[0];

  if (String(user.status || "").toUpperCase() !== "ACTIVE") {
    throw new AuthError("Account is inactive. Please contact admin.", 403, "INACTIVE");
  }

  if (!user.password) {
    throw new AuthError("Invalid username or password", 401, "INVALID_CREDENTIALS");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AuthError("Invalid username or password", 401, "INVALID_CREDENTIALS");
  }

  const roleName = user.role_name || "UNKNOWN";

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new AuthError("Server misconfigured", 500, "JWT_SECRET_MISSING");
  }

  const payload = {
    username: user.user_name,
    roleId: user.user_role_id,
    role: roleName,
    department_id: user.department_id ?? null,
    departmentId: user.department_id ?? null, // backward compatibility for older consumers
    status: user.status ?? null,
  };

  if (isAuthDebugEnabled()) {
    console.log("✅ Login success:", { username: payload.username, roleId: payload.roleId, role: payload.role });
    console.log("🔎 JWT payload:", payload);
  }

  const token = jwt.sign(payload, jwtSecret, { expiresIn: "1d" });

  return {
    success: true,
    token,
    user: {
      username: payload.username,
      role: payload.role,
      roleId: payload.roleId,
      department_id: payload.department_id,
      status: payload.status,
    },
  };
}

// ── POST /api/auth/login ────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Username and password are required" });
    }

    const result = await loginService(username, password);

    res.cookie("token", result.token, cookieOptions());

    if (isAuthDebugEnabled()) {
      console.log("✅ Login cookie set for user:", result.user?.username);
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    const status = err?.statusCode || 401;
    const message = err?.message || "Login failed";
    return res.status(status).json({
      success: false,
      message,
      code: err?.code || "LOGIN_FAILED",
    });
  }
};

// ── POST /api/auth/logout ───────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    const opts = cookieOptions();
    delete opts.maxAge;
    res.clearCookie("token", opts);

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (err) {
    console.error("Logout error:", err.message);
    return res.status(500).json({ message: "Logout failed" });
  }
};

// ── GET /api/auth/me ────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const { username, role, roleId, department_id, status } = req.user;

    let departmentName = null;
    let advisorFields = {};

    if (department_id) {
      try {
        const { rows: deptRows } = await eventPool.query(
          "SELECT department_name FROM department WHERE department_id = $1",
          [department_id]
        );
        if (deptRows && deptRows.length > 0) {
          departmentName = deptRows[0].department_name;
        }
      } catch (err) {
        console.warn("⚠ Could not fetch department name:", err.message);
      }
    }

    if (role === "ADVISOR") {
      try {
        const { rows: facultyRows } = await eventPool.query(
          "SELECT current_year, batch FROM user_faculty WHERE user_name = $1 LIMIT 1",
          [username]
        );
        if (facultyRows && facultyRows.length > 0) {
          advisorFields = {
            current_year: facultyRows[0].current_year,
            batch: facultyRows[0].batch,
          };
        }
      } catch (err) {
        console.warn("⚠ Could not fetch advisor fields:", err.message);
      }
    }

    return res.json({
      success: true,
      user: {
        username,
        role,
        roleId,
        department_id: department_id ?? null,
        departmentName,
        status: status || null,
        ...advisorFields,
      },
    });
  } catch (err) {
    console.error("getMe error:", err.message);
    return res.status(500).json({ message: "Error fetching user info" });
  }
};
