// backend/src/controllers/auth.controller.js
const authService = require("../services/auth.service");
const { eventPool } = require("../config/db");

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

// ─── POST /api/auth/login ────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Username and password are required" });
    }

    const result = await authService.login(username, password);

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

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
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

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
// Returns user info + departmentName (looked up from DB) + advisor fields
exports.getMe = async (req, res) => {
  try {
    const { username, role, roleId, department_id, status } = req.user;

    // Fetch department name from DB if department_id exists
    let departmentName = null;
    let advisorFields = {}; // current_year, batch for advisor role

    if (department_id) {
      try {
        const [deptRows] = await eventPool.query(
          "SELECT department_name FROM department WHERE department_id = ?",
          [department_id]
        );
        if (deptRows && deptRows.length > 0) {
          departmentName = deptRows[0].department_name;
        }
      } catch (err) {
        console.warn("⚠ Could not fetch department name:", err.message);
      }
    }

    // If user is ADVISOR, fetch their assigned batch + current_year from user_faculty
    if (role === "ADVISOR") {
      try {
        const [facultyRows] = await eventPool.query(
          "SELECT current_year, batch FROM user_faculty WHERE user_name = ? LIMIT 1",
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
        departmentName,          // ← used by CreateUserForm to lock department field
        status: status || null,
        ...advisorFields,        // current_year, batch (only for ADVISOR)
      },
    });
  } catch (err) {
    console.error("getMe error:", err.message);
    return res.status(500).json({ message: "Error fetching user info" });
  }
};