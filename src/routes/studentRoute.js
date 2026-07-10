const express = require("express");
const multer = require("multer");
const router = express.Router();
const studentController = require("../controllers/studentController");
const { verifyToken, allowRoles } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .xlsx and .csv files are allowed"), ok);
  },
});

router.post(
  "/",
  verifyToken,
  allowRoles("ADVISOR"),
  studentController.createStudents
);

router.get(
  "/",
  verifyToken,
  allowRoles("ADVISOR"),
  studentController.getAdvisorStudents
);

router.post(
  "/range",
  verifyToken,
  allowRoles("ADVISOR"),
  studentController.createStudentsRange
);

router.post(
  "/single",
  verifyToken,
  allowRoles("ADVISOR"),
  studentController.createStudentSingle
);

router.post(
  "/excel",
  verifyToken,
  allowRoles("ADVISOR"),
  upload.single("file"),
  studentController.createStudentsExcel
);

router.get(
  "/excel-template",
  verifyToken,
  allowRoles("ADVISOR"),
  studentController.downloadExcelTemplate
);

router.put(
  "/:roll_no",
  verifyToken,
  allowRoles("ADVISOR"),
  studentController.updateStudent
);

router.post(
  "/promote-batch",
  verifyToken,
  allowRoles("ADMIN"),
  studentController.promoteBatch
);

module.exports = router;
