// src/services/loginService.js
// Business logic for the login flow specifically: password verification,
// access/refresh token generation, and refresh-token verification/rotation.
// Logout and "get current user" logic stay in authService.js.

const { authPool, callProcedure } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");
const { AuthError, isAuthDebugEnabled } = require("./authService");

function parseExpiresInToMs(val) {
  const match = String(val || "").trim().match(/^(\d+)([mdh])$/i);
  if (!match) return 15 * 60 * 1000; // default 15m
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return 15 * 60 * 1000;
}

function signAccessToken(payload) {
  const jwtSecret = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new AuthError("Server misconfigured", 500, "JWT_SECRET_MISSING");
  }
  const expiry = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";
  return jwt.sign(payload, jwtSecret, { expiresIn: expiry });
}

function signRefreshToken(payload) {
  const refreshSecret = process.env.REFRESH_TOKEN_SECRET;
  if (!refreshSecret) {
    throw new AuthError("Server misconfigured", 500, "REFRESH_TOKEN_SECRET_MISSING");
  }
  const expiry = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";
  return jwt.sign(payload, refreshSecret, { expiresIn: expiry });
}

function getRefreshTokenMaxAgeMs() {
  return parseExpiresInToMs(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d");
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

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ username: payload.username });

  const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";
  const expiresAtMs = Date.now() + parseExpiresInToMs(refreshTokenExpiry);
  const expiresAt = new Date(expiresAtMs);

  // Store refresh token raw (nokk-be style) — single active session per user.
  await callProcedure(authPool, "sp_insert_refresh_token", [
    payload.username,
    refreshToken,
    expiresAt,
  ]);

  return {
    success: true,
    accessToken,
    refreshToken,
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

async function refreshService(refreshToken) {
  if (!refreshToken) {
    throw new AuthError("Refresh token is required", 401, "REFRESH_TOKEN_REQUIRED");
  }

  const refreshSecret = process.env.REFRESH_TOKEN_SECRET;
  if (!refreshSecret) {
    throw new AuthError("Server misconfigured", 500, "REFRESH_TOKEN_SECRET_MISSING");
  }

  // 1. Verify JWT signature/expiry
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, refreshSecret);
  } catch (err) {
    throw new AuthError("Invalid or expired refresh token", 401, "REFRESH_TOKEN_INVALID");
  }

  // 2. Lookup token in DB (must exist and expires_at > NOW())
  const rows = await callProcedure(authPool, "sp_get_refresh_token", [refreshToken]);
  if (!rows || rows.length === 0) {
    throw new AuthError("Refresh token is invalid or has been revoked", 401, "REFRESH_TOKEN_REVOKED");
  }

  const dbRow = rows[0];

  // 3. Fetch user and verify active status (EMS live account active check)
  const loginRows = await callProcedure(authPool, "sp_login_user", [dbRow.user_name]);
  if (!loginRows || loginRows.length === 0) {
    throw new AuthError("User not found", 401, "USER_NOT_FOUND");
  }

  const user = loginRows[0];
  if (String(user.status || "").toUpperCase() !== "ACTIVE") {
    throw new AuthError("Account is inactive. Please contact admin.", 403, "INACTIVE");
  }

  const roleName = user.role_name || "UNKNOWN";

  const payload = {
    username:             user.user_name,
    roleId:               user.user_role_id,
    role:                 roleName,
    department_id:        user.department_id   ?? null,
    departmentId:         user.department_id   ?? null,
    status:               user.status          ?? null,
    must_change_password: user.must_change_password ?? false,
  };

  // 4. Generate new access token only (nokk-be style: do not rotate refresh token)
  const accessToken = signAccessToken(payload);

  return {
    success: true,
    accessToken,
    user: {
      username:             payload.username,
      role:                 payload.role,
      roleId:               payload.roleId,
      department_id:        payload.department_id,
      status:               payload.status,
      must_change_password: payload.must_change_password,
    }
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  parseExpiresInToMs,
  getRefreshTokenMaxAgeMs,
  loginService,
  refreshService,
};
