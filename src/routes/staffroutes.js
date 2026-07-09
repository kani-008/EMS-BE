// backend/src/routes/staff.routes.js
const express = require("express");
const multer = require("multer");
const router = express.Router();

const { verifyToken, allowRoles } = require("../middleware/authmiddleware");
const staffController = require("../controllers/staffcontroller");

// Setup multer for Excel template upload (max 5 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .xlsx and .csv files are allowed"), ok);
  },
});

// ── Staff Dashboard ────────────────────────────────────────────────────────────
router.get(
  "/dashboard",
  verifyToken,
  allowRoles("PRINCIPAL", "HOD", "ADVISOR"),
  (req, res) => {
    res.json({
      message: "Staff dashboard data",
      user: req.user,
    });
  }
);

// ── Staff Profile ──────────────────────────────────────────────────────────────
router.get(
  "/profile",
  verifyToken,
  allowRoles("PRINCIPAL", "HOD", "ADVISOR"),
  staffController.getProfile
);

router.put(
  "/profile",
  verifyToken,
  allowRoles("PRINCIPAL", "HOD", "ADVISOR"),
  staffController.updateProfile
);

// ── Student Creation (Advisor flow) ────────────────────────────────────────────
router.get(
  "/advisor-context",
  verifyToken,
  allowRoles("ADVISOR"),
  staffController.getAdvisorContext
);

router.get(
  "/students",
  verifyToken,
  allowRoles("ADVISOR"),
  staffController.getAdvisorStudents
);

router.post(
  "/students/range",
  verifyToken,
  allowRoles("ADVISOR"),
  staffController.createStudentsRange
);

router.post(
  "/students/single",
  verifyToken,
  allowRoles("ADVISOR"),
  staffController.createStudentSingle
);

router.post(
  "/students/excel",
  verifyToken,
  allowRoles("ADVISOR"),
  upload.single("file"),
  staffController.createStudentsExcel
);

router.get(
  "/students/excel-template",
  verifyToken,
  allowRoles("ADVISOR"),
  staffController.downloadExcelTemplate
);

router.put(
  "/students/:roll_no",
  verifyToken,
  allowRoles("ADVISOR"),
  staffController.updateStudent
);

module.exports = router;
