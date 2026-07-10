const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, allowRoles } = require("../middleware/auth");

router.get(
  "/",
  verifyToken,
  allowRoles("ADVISOR", "ADMIN"),
  userController.getUsers
);

module.exports = router;
