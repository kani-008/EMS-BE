// backend/src/services/auth.service.js
const { authPool, callProcedure } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const ROLE_MAP = {
  R01: "STUDENT",
  R02: "FACULTY",
  R03: "ADVISOR",
  R04: "HOD",
  R05: "PRINCIPAL",
  R06: "ADMIN",
  R07: "PLACEMENT",
  R08: "SPORTS",
};

function mapRole(roleId) {
  return ROLE_MAP[roleId] || "UNKNOWN";
}

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

exports.login = async (username, password) => {
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

  const roleName = mapRole(user.user_role_id);

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

  const token = jwt.sign(
    payload,
    jwtSecret,
    { expiresIn: "1d" }
  );

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
};

exports.AuthError = AuthError;