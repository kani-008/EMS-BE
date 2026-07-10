const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const { verifyToken, allowRoles } = require("../middleware/auth");

const ALL_ROLES = ["STUDENT", "ADMIN", "ADVISOR", "HOD", "PRINCIPAL", "FACULTY", "PLACEMENT", "SPORTS"];

router.get(
  "/",
  verifyToken,
  allowRoles(...ALL_ROLES),
  profileController.getProfile
);

router.put(
  "/",
  verifyToken,
  allowRoles(...ALL_ROLES),
  profileController.updateProfile
);

router.put(
  "/password",
  verifyToken,
  allowRoles(...ALL_ROLES),
  profileController.changePassword
);

module.exports = router;
