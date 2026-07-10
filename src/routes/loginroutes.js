// backend/src/routes/loginroutes.js
const express = require("express");
const router = express.Router();
const loginController = require("../controllers/logincontroller");
const { verifyToken } = require("../middleware/authmiddleware");

router.post("/login", loginController.login);
router.post("/logout", loginController.logout);
router.get("/me", verifyToken, loginController.getMe);

module.exports = router;
