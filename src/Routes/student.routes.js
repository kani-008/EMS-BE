// backend/src/routes/student.routes.js
const express = require("express");
const router = express.Router();

const { verifyToken, allowRoles } = require("../middleware/auth.middleware");
const studentController = require("../controllers/student.controller");

// ── Student Dashboard ────────────────────────────────────────────────────────
router.get(
  "/dashboard",
  verifyToken,
  allowRoles("STUDENT"),
  (req, res) => {
    res.json({
      message: "Student dashboard data",
      user: req.user,
    });
  }
);

// ── Student Profile ──────────────────────────────────────────────────────────
router.get(
  "/profile",
  verifyToken,
  allowRoles("STUDENT"),
  studentController.getProfile
);

router.put(
  "/profile",
  verifyToken,
  allowRoles("STUDENT"),
  studentController.updateProfile
);

router.put(
  "/profile/password",
  verifyToken,
  allowRoles("STUDENT"),
  studentController.changePassword
);

module.exports = router;
