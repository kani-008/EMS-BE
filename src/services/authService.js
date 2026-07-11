// src/services/authService.js
// Business logic for session teardown and "current user" lookup.
// Login/refresh-token logic lives in src/services/loginService.js.
// No req/res handling. All functions return data or throw.

const { authPool, eventPool, callProcedure } = require("../config/db");

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

async function logoutService(refreshToken, username) {
  if (refreshToken) {
    await callProcedure(authPool, "sp_delete_refresh_token", [refreshToken]);
  } else if (username) {
    await callProcedure(authPool, "sp_delete_all_refresh_tokens", [username]);
  }
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

module.exports = {
  AuthError,
  isAuthDebugEnabled,
  logoutService,
  getMeService
};
