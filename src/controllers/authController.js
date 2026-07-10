// src/controllers/authController.js
// Express request handlers for auth routes.
// All business logic lives in src/services/authService.js.

const { cookieOptions, loginService, getMeService, AuthError } = require("../services/authService");

exports.login = async (req, res) => {
  const { username, password } = req.body;

  console.log({
    route:    "POST /api/auth/login",
    username: username || null,
    status:   "logging in",
  });

  try {
    if (!username || !password) {
      console.log({ route: "POST /api/auth/login", status: 400, message: "Username and password are required" });
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    const result = await loginService(username, password);

    res.cookie("token", result.token, cookieOptions());

    console.log({
      route:   "POST /api/auth/login",
      username: result.user?.username || null,
      role:     result.user?.role     || null,
      status:   200,
      message:  "Login successful",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token:   result.token,
      user:    result.user,
    });
  } catch (err) {
    const status  = err?.statusCode || 401;
    const message = err?.message    || "Login failed";

    console.error({
      route:    "POST /api/auth/login",
      username: username || null,
      status,
      error:    message,
      code:     err?.code || "LOGIN_FAILED",
    });

    return res.status(status).json({
      success: false,
      message,
      code: err?.code || "LOGIN_FAILED",
    });
  }
};

exports.logout = async (req, res) => {
  console.log({ route: "POST /api/auth/logout", status: "logging out" });

  try {
    const opts = cookieOptions();
    delete opts.maxAge;
    res.clearCookie("token", opts);

    console.log({ route: "POST /api/auth/logout", status: 200, message: "Logout successful" });

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
