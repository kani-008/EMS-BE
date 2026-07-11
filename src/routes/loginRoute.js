const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const loginController = require("../controllers/loginController");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: { success: false, message: "Too many login attempts. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, loginController.login);
router.post("/refresh-token", loginController.refreshAccessToken);

module.exports = router;
