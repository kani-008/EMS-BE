// backend/src/routes/admin.routes.js

const express  = require("express");
const multer   = require("multer");
const router   = express.Router();
const adminController = require("../controllers/admin.controller");
const { verifyToken, allowRoles } = require("../middleware/auth.middleware");

// Multer: store Excel/CSV in memory (no disk writes, max 5 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .xlsx and .csv files are allowed"), ok);
  },
});

// ── Reference data (departments + staff roles) ────────────────────────────────
router.get(
  "/departments",
  verifyToken,
  allowRoles("ADVISOR", "ADMIN"),
  adminController.getDepartments
);

router.get(
  "/staff-roles",
  verifyToken,
  allowRoles("ADMIN"),
  adminController.getStaffRoles
);

// ── Batch validation (derives current_year via SP — no frontend math) ─────────
router.get(
  "/validate-batch",
  verifyToken,
  allowRoles("ADMIN"),
  adminController.validateBatch
);

// ── Student creation (ADVISOR only in practice — batch/dept enforced in SP) ───
router.post(
  "/create-users",
  verifyToken,
  allowRoles("ADVISOR", "ADMIN"),
  adminController.createUsers
);

// ── User list ─────────────────────────────────────────────────────────────────
router.get(
  "/users",
  verifyToken,
  allowRoles("ADVISOR", "ADMIN"),
  adminController.getUsers
);

// ── Staff creation (ADMIN only) ───────────────────────────────────────────────
router.post(
  "/create-staff",
  verifyToken,
  allowRoles("ADMIN"),
  adminController.createStaff
);

// ── Staff update (ADMIN only) ─────────────────────────────────────────────────
router.put(
  "/update-staff/:facultyId",
  verifyToken,
  allowRoles("ADMIN"),
  adminController.updateStaff
);

// ── Bulk staff creation via Excel upload (ADMIN only) ─────────────────────────
router.post(
  "/upload-staff-excel",
  verifyToken,
  allowRoles("ADMIN"),
  upload.single("file"),
  adminController.uploadStaffExcel
);

// \u2500\u2500 Admin profile \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
router.get(
  "/profile",
  verifyToken,
  allowRoles("ADMIN"),
  adminController.getProfile
);

router.put(
  "/profile",
  verifyToken,
  allowRoles("ADMIN"),
  adminController.updateProfile
);

// ── Promote batch year (ADMIN only) ──────────────────────────────────────────
router.post(
  "/promote-batch",
  verifyToken,
  allowRoles("ADMIN"),
  adminController.promoteYearForBatch
);

module.exports = router;