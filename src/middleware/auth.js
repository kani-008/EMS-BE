// backend/src/middleware/auth.middleware.js
const jwt = require("jsonwebtoken");
const { authPool } = require("../config/db");

// The hardcoded ROLE_MAP that used to live here (R06→"ADMIN", R08→"SPORTS" —
// backwards from the real DB data) is gone. auth.service.js now resolves the
// correct role name from the database ONCE, at login, via
// sp_get_role_name_by_id / sp_get_credentials_role_name, and signs it into
// the JWT. Since the JWT is signed with JWT_SECRET, `decoded.role` can be
// trusted here without hitting the database again on every request.

function isAuthDebugEnabled() {
  return String(process.env.AUTH_DEBUG || "").toLowerCase() === "true";
}

// SECURITY: re-check live account status on every request, not just at
// login. Without this, deactivating a user (admin suspends a student/staff
// account) has NO effect until their existing JWT expires (up to 24h later)
// — they keep full access with a still-valid signature the whole time. This
// is one extra indexed lookup per request (table_login.user_name is
// indexed), so the latency cost is small; skip it only if you have a
// caching layer in front of this and understand the revocation-delay
// trade-off you're taking on. Set SKIP_LIVE_STATUS_CHECK=true to disable.
async function isAccountActive(username) {
  if (String(process.env.SKIP_LIVE_STATUS_CHECK || "").toLowerCase() === "true") {
    return true;
  }
  const { rows } = await authPool.query(
    "SELECT status FROM table_login WHERE user_name = $1 LIMIT 1",
    [username]
  );
  if (!rows || rows.length === 0) return false;
  return String(rows[0].status || "").toUpperCase() === "ACTIVE";
}

const verifyToken = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, code: "NO_TOKEN", message: "No token provided" });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: "Server misconfigured" });
    }

    const decoded = jwt.verify(token, jwtSecret);

    const active = await isAccountActive(decoded.username);
    if (!active) {
      return res.status(403).json({ success: false, message: "Account is inactive. Please contact admin." });
    }

    req.user = {
      username: decoded.username,
      role: decoded.role || "UNKNOWN",
      roleId: decoded.roleId,
      department_id: decoded.department_id || decoded.departmentId || null,
      status: decoded.status || null,
      must_change_password: decoded.must_change_password || false,
    };

    if (isAuthDebugEnabled()) {
      console.log("🔎 Decoded JWT:", decoded);
      console.log("✅ req.user resolved:", req.user);
    }

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, code: "TOKEN_EXPIRED", message: "Token has expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ success: false, code: "TOKEN_INVALID", message: "Invalid token" });
    }
    console.error("❌ Auth middleware error:", err.message);
    return res.status(500).json({ success: false, message: "Authentication error" });
  }
};

const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      console.error(`❌ Access denied: role "${req.user?.role}" not in [${roles}]`);
      return res.status(403).json({
        message: `Access denied. Role '${req.user?.role}' is not permitted.`,
      });
    }
    next();
  };
};

module.exports = { verifyToken, allowRoles };
