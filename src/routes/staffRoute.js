const express = require("express");
const multer = require("multer");
const router = express.Router();
const staffController = require("../controllers/staffController");
const { verifyToken, allowRoles } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .xlsx and .csv files are allowed"), ok);
  },
});

router.get(
  "/validate-batch",
  verifyToken,
  allowRoles("ADMIN"),
  staffController.validateBatch
);

router.post(
  "/",
  verifyToken,
  allowRoles("ADMIN"),
  staffController.createStaff
);

router.put(
  "/:facultyId",
  verifyToken,
  allowRoles("ADMIN"),
  staffController.updateStaff
);

router.post(
  "/bulk",
  verifyToken,
  allowRoles("ADMIN"),
  upload.single("file"),
  staffController.uploadStaffExcel
);

router.get(
  "/advisor-context",
  verifyToken,
  allowRoles("ADVISOR"),
  staffController.getAdvisorContext
);

router.patch(
  "/:facultyId/status",
  verifyToken,
  allowRoles("ADMIN"),
  staffController.updateStaffStatus
);

module.exports = router;
