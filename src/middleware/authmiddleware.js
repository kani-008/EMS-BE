// backend/src/middleware/auth.middleware.js
const jwt = require("jsonwebtoken");

// The hardcoded ROLE_MAP that used to live here (R06→"ADMIN", R08→"SPORTS" —
// backwards from the real DB data) is gone. auth.service.js now resolves the
// correct role name from the database ONCE, at login, via
// sp_get_role_name_by_id / sp_get_credentials_role_name, and signs it into
// the JWT. Since the JWT is signed with JWT_SECRET, `decoded.role` can be
// trusted here without hitting the database again on every request.

function isAuthDebugEnabled() {
  return String(process.env.AUTH_DEBUG || "").toLowerCase() === "true";
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
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: "Server misconfigured" });
    }

    const decoded = jwt.verify(token, jwtSecret);

    req.user = {
      username: decoded.username,
      role: decoded.role || "UNKNOWN",
      roleId: decoded.roleId,
      department_id: decoded.department_id || decoded.departmentId || null,
      status: decoded.status || null,
    };

    if (isAuthDebugEnabled()) {
      console.log("🔎 Decoded JWT:", decoded);
      console.log("✅ req.user resolved:", req.user);
    }

    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
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
