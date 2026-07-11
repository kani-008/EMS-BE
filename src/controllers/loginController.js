// src/controllers/loginController.js
// Express request handlers for the login flow: POST /login, POST /refresh-token.
// All business logic lives in src/services/loginService.js.

const {
  loginService,
  refreshService,
  getRefreshTokenMaxAgeMs,
} = require("../services/loginService");

function setRefreshCookie(res, refreshToken) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: getRefreshTokenMaxAgeMs(),
  });
}

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

    console.log({
      route:   "POST /api/auth/login",
      username: result.user?.username || null,
      role:     result.user?.role     || null,
      status:   200,
      message:  "Login successful",
    });

    setRefreshCookie(res, result.refreshToken);

    // Refresh token is httpOnly-cookie-only — never echoed in the JSON body,
    // so the frontend has no way to read or store it in JS-accessible storage.
    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken: result.accessToken,
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

exports.refreshAccessToken = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
  console.log({ route: "POST /api/auth/refresh-token", status: "refreshing token" });

  try {
    const result = await refreshService(refreshToken);
    return res.status(200).json({
      success: true,
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (err) {
    const status = err?.statusCode || 401;
    const message = err?.message || "Token refresh failed";

    console.error({
      route: "POST /api/auth/refresh-token",
      status,
      error: message,
      code: err?.code || "REFRESH_FAILED",
    });

    return res.status(status).json({
      success: false,
      message,
      code: err?.code || "REFRESH_FAILED"
    });
  }
};
