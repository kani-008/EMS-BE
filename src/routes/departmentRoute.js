const express = require("express");
const router = express.Router();
const departmentController = require("../controllers/departmentController");
const { verifyToken, allowRoles } = require("../middleware/auth");

router.get("/",verifyToken,allowRoles("ADVISOR", "ADMIN"),departmentController.getDepartments);

module.exports = router;
