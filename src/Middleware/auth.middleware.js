// backend/src/middleware/auth.middleware.js
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

function isAuthDebugEnabled() {
  return String(process.env.AUTH_DEBUG || "").toLowerCase() === "true";
}

const verifyToken = async (req, res, next) => {
  try {
    // ✅ Try to get token from:
    // 1. Authorization header (Bearer token) - for backward compatibility
    // 2. HTTP-only cookie - new secure method
    
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
      return res
        .status(500)
        .json({ success: false, message: "Server misconfigured" });
    }

    const decoded = jwt.verify(token, jwtSecret);

    const mappedRole = mapRole(decoded.roleId);

    req.user = {
      username: decoded.username,
      role: mappedRole,
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
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired token" });
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
