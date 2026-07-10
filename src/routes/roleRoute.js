const express = require("express");
const router = express.Router();
const roleController = require("../controllers/roleController");
const { verifyToken, allowRoles } = require("../middleware/auth");

router.get(
  "/",
  verifyToken,
  allowRoles("ADMIN"),
  roleController.getStaffRoles
);

module.exports = router;
