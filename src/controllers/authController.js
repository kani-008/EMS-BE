// src/controllers/authController.js
// Express request handlers for session teardown and "current user" lookup.
// Login/refresh-token handlers live in src/controllers/loginController.js.
// All business logic lives in src/services/authService.js.

const {
  logoutService,
  getMeService,
} = require("../services/authService");

exports.logout = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
  const username = req.user?.username || "unknown";
  
  console.log({ 
    route: "POST /api/auth/logout", 
    username, 
    status: "logging out",
    singleSession: !!refreshToken 
  });

  try {
    await logoutService(refreshToken, username);

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    console.log(`[logout] User ${username} successfully logged out at ${new Date().toISOString()} (all sessions: ${!refreshToken})`);

    return res.status(200).json({ success: true, message: "Logout successful" });
  } catch (err) {
    console.error({ route: "POST /api/auth/logout", status: 500, error: err.message });
    return res.status(500).json({ message: "Logout failed" });
  }
};

exports.getMe = async (req, res) => {
  const userPayload = req.user || {};
  console.log({ route: "GET /api/auth/me", username: userPayload.username || null, status: "fetching user info" });

  try {
    const { username, role, roleId, department_id, status, must_change_password } = req.user;

    const profile = await getMeService(username, role, roleId, department_id);

    console.log({ route: "GET /api/auth/me", username, role, status: 200 });

    return res.json({
      success: true,
      user: {
        ...profile,
        status:               status || null,
        must_change_password: must_change_password || false,
      },
    });
  } catch (err) {
    console.error({ route: "GET /api/auth/me", status: 500, error: err.message });
    return res.status(500).json({ message: "Error fetching user info" });
  }
};
