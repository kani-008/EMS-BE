// backend/src/services/auth.service.js
const { authPool, eventPool, callProcedure } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────────────────────────────────────
// ROLE RESOLUTION — replaces the old hardcoded ROLE_MAP.
//
// The old ROLE_MAP in this file (and duplicated again in auth.middleware.js)
// had R06 mapped to "ADMIN" and R08 mapped to "SPORTS" — backwards from the
// actual DB data, where R08 = ADMIN (credentials.table_role) and
// R06 = PLACEMENT (event_management.user_role). Every real admin login was
// silently being tagged "SPORTS".
//
// Fix: resolve the role name from the database at login time, embed the
// correct name in the JWT, and have auth.middleware.js simply trust that
// signed value on every subsequent request instead of re-deriving it from
// a hardcoded table.
// ─────────────────────────────────────────────────────────────────────────────
async function resolveRoleName(roleId) {
  const rows = await callProcedure(eventPool, "sp_get_role_name_by_id", [roleId]);
  if (rows && rows.length > 0) return rows[0].user_role;

  // ADMIN (R08) isn't in event_management.user_role — it only exists in
  // credentials.table_role.
  const credRows = await callProcedure(authPool, "sp_get_credentials_role_name", [roleId]);
  if (credRows && credRows.length > 0) return credRows[0].role_name;

  return "UNKNOWN";
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

  const roleName = await resolveRoleName(user.user_role_id);

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
};

exports.AuthError = AuthError;
