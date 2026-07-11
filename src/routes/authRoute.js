const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");

router.post("/logout", verifyToken, authController.logout);
router.get("/me", verifyToken, authController.getMe);

module.exports = router;
