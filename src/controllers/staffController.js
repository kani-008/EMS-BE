// src/controllers/staffController.js
// Express request handlers for staff routes.
// All business logic lives in src/services/staffService.js.

const XLSX = require("xlsx");
const {
  validateBatchService,
  createStaffService,
  updateStaffService,
  bulkCreateStaffService,
  getAdvisorContextService,
  updateStaffStatusService,
} = require("../services/staffService");

exports.validateBatch = async (req, res) => {
  try {
    const { batch, course } = req.query;
    if (!batch || !course) {
      return res.status(400).json({ success: false, message: "batch and course query params are required" });
    }
    const result = await validateBatchService(batch, course);
    return res.json(result);
  } catch (err) {
    console.error("❌ validateBatch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStaff = async (req, res) => {
  try {
    const { firstName, lastName, gender, department, staffRole, batch, course, currentYear, password } = req.body;
    const result = await createStaffService(req.user, {
      firstName, lastName, gender, department, staffRole, batch, course, currentYear, password,
    });
    return res.json(result);
  } catch (err) {
    console.error("createStaff error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { firstName, lastName, department, batch, currentYear, role } = req.body;
    const result = await updateStaffService(req.user, { facultyId, firstName, lastName, department, batch, currentYear, role });
    return res.json(result);
  } catch (err) {
    console.error("updateStaff error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.uploadStaffExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const ext = req.file.originalname.split(".").pop().toLowerCase();
    if (!["xlsx", "csv"].includes(ext)) {
      return res.status(400).json({ success: false, message: "Only .xlsx and .csv files are accepted." });
    }

    const workbook  = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rawRows   = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ success: false, message: "The uploaded file contains no data rows." });
    }
    if (rawRows.length > 500) {
      return res.status(400).json({ success: false, message: "Excel file exceeds maximum limit of 500 rows." });
    }

    const rows = rawRows.map((r) => {
      const normalised = {};
      Object.keys(r).forEach((k) => {
        normalised[k.trim().toLowerCase().replace(/\s+/g, "_")] = r[k];
      });
      return normalised;
    });

    const result = await bulkCreateStaffService(req.user, rows);
    return res.json(result);
  } catch (err) {
    console.error("uploadStaffExcel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAdvisorContext = async (req, res) => {
  try {
    const result = await getAdvisorContextService(req.user.username);
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.getAdvisorContext error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateStaffStatus = async (req, res) => {
  try {
    const caller = req.user;
    const { facultyId } = req.params;
    const { status } = req.body;

    if (caller.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Unauthorized: only administrators can change staff status" });
    }
    if (!facultyId || !status) {
      return res.status(400).json({ success: false, message: "Faculty ID and status are required" });
    }

    const targetStatus = String(status).toUpperCase();
    if (targetStatus !== "ACTIVE" && targetStatus !== "INACTIVE") {
      return res.status(400).json({ success: false, message: "Invalid status value. Must be ACTIVE or INACTIVE" });
    }

    const result = await updateStaffStatusService(caller, facultyId, targetStatus);
    return res.json(result);
  } catch (err) {
    console.error("❌ updateStaffStatus error:", err.message);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};
