// src/services/authService.js
// Business logic for authentication — login, token building, cookie config.
// No req/res handling. All functions return data or throw.

const { authPool, eventPool, callProcedure } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");

class AuthError extends Error {
  constructor(message, statusCode = 400, code = "AUTH_ERROR") {
    super(message);
    this.name       = "AuthError";
    this.statusCode = statusCode;
    this.code       = code;
  }
}

function isAuthDebugEnabled() {
  return String(process.env.AUTH_DEBUG || "").toLowerCase() === "true";
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // In production (cross-origin): SameSite=None + Secure=true required.
    // In development (localhost):   SameSite=Lax  + Secure=false is enough.
    secure:   isProd ? true  : false,
    sameSite: isProd ? "none" : "Lax",
    path:     "/",
    maxAge:   30 * 24 * 60 * 60 * 1000,
  };
}

async function loginService(username, password) {
  const cleanUsername = String(username || "").trim();
  const cleanPassword = String(password  || "");

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
    username:             user.user_name,
    roleId:               user.user_role_id,
    role:                 roleName,
    department_id:        user.department_id   ?? null,
    departmentId:         user.department_id   ?? null,
    status:               user.status          ?? null,
    must_change_password: user.must_change_password ?? false,
  };

  if (isAuthDebugEnabled()) {
    console.log("✅ Login success:", { username: payload.username, roleId: payload.roleId, role: payload.role });
    console.log("🔎 JWT payload:", payload);
  }

  const token = jwt.sign(payload, jwtSecret, { expiresIn: "30d" });

  return {
    success: true,
    token,
    user: {
      username:             payload.username,
      role:                 payload.role,
      roleId:               payload.roleId,
      department_id:        payload.department_id,
      status:               payload.status,
      must_change_password: payload.must_change_password,
    },
  };
}

async function getMeService(username, role, roleId, department_id) {
  let departmentName  = null;
  let advisorFields   = {};

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
      console.warn({ context: "getMeService (fetch department)", error: err.message });
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
          batch:        facultyRows[0].batch,
        };
      }
    } catch (err) {
      console.warn({ context: "getMeService (fetch advisor fields)", error: err.message });
    }
  }

  return {
    username,
    role,
    roleId,
    department_id:    department_id ?? null,
    departmentName,
    ...advisorFields,
  };
}

module.exports = { AuthError, isAuthDebugEnabled, cookieOptions, loginService, getMeService };
