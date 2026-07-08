// backend/src/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth.middleware");

router.post("/login", authController.login);
router.post("/logout", authController.logout); // ✅ NEW: Clear cookie
router.get("/me", verifyToken, authController.getMe); // 🔥 Get user info

module.exports = router;
