// backend/src/controllers/admin.controller.js
const XLSX         = require("xlsx");
const adminService = require("../services/admin.service");

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const result = await adminService.getUsersService(req);
    return res.json(result);
  } catch (err) {
    console.error("❌ getUsers error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/departments ───────────────────────────────────────────────
// Returns all departments from DB for frontend dropdowns (no hardcoding).
exports.getDepartments = async (req, res) => {
  try {
    const result = await adminService.getDepartmentsService();
    return res.json(result);
  } catch (err) {
    console.error("❌ getDepartments error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/staff-roles ───────────────────────────────────────────────
// Returns all staff-eligible roles from DB for frontend dropdowns.
exports.getStaffRoles = async (req, res) => {
  try {
    const result = await adminService.getStaffRolesService();
    return res.json(result);
  } catch (err) {
    console.error("❌ getStaffRoles error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/validate-batch ────────────────────────────────────────────
// Validates a batch year against a course via stored procedure.
// Returns: { success, valid, currentYear, message }
// The current calendar year is injected server-side — never from the client.
exports.validateBatch = async (req, res) => {
  try {
    const { batch, course } = req.query;
    if (!batch || !course) {
      return res.status(400).json({ success: false, message: "batch and course query params are required" });
    }
    const result = await adminService.validateBatchService(batch, course);
    return res.json(result);
  } catch (err) {
    console.error("❌ validateBatch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/admin/create-users ─────────────────────────────────────────────
// Creates student accounts for an advisor's cohort.
// department_id and batch are resolved from DB via advisor's username — never from client.
exports.createUsers = async (req, res) => {
  try {
    const { prefix, userType, rangeFrom, rangeTo, course, semester, batch } = req.body;

    const result = await adminService.createUsersService(req, {
      prefix,
      userType,
      rangeFrom,
      rangeTo,
      course,
      semester,
      batch,
    });

    return res.json(result);
  } catch (err) {
    console.error("createUsers error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST /api/admin/create-staff ────────────────────────────────────────────
// Creates a staff user (ADMIN only — enforced by route middleware).
// All body fields passed to service; validation happens in sp_create_staff_user.
exports.createStaff = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      gender,
      department,
      staffRole,
      batch,
      course,
      currentYear,
      password,
    } = req.body;

    const result = await adminService.createStaffService(req, {
      firstName,
      lastName,
      gender,
      department,
      staffRole,
      batch,
      course,
      currentYear,
      password,
    });

    return res.json(result);
  } catch (err) {
    console.error("createStaff error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/admin/update-staff/:facultyId ───────────────────────────────────
// Updates editable fields of a staff user (ADMIN only).
// faculty_id comes from route param (immutable), body supplies the changed fields.
exports.updateStaff = async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { firstName, lastName, department, batch, currentYear, role } = req.body;

    const result = await adminService.updateStaffService(req, {
      facultyId,
      firstName,
      lastName,
      department,
      batch,
      currentYear,
      role,
    });

    return res.json(result);
  } catch (err) {
    console.error("updateStaff error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST /api/admin/upload-staff-excel ──────────────────────────────────────
// Accepts a multipart/form-data upload with field name "file" (.xlsx or .csv).
// Parses the workbook, validates rows, and calls bulkCreateStaffService.
exports.uploadStaffExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const ext = req.file.originalname.split(".").pop().toLowerCase();
    if (!["xlsx", "csv"].includes(ext)) {
      return res.status(400).json({ success: false, message: "Only .xlsx and .csv files are accepted." });
    }

    // Parse workbook from buffer (file stored in memory by multer)
    const workbook  = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];

    // Convert to array of objects; header row defines column keys
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ success: false, message: "The uploaded file contains no data rows." });
    }

    // Normalise column names: trim + lowercase + replace spaces with underscores
    const rows = rawRows.map((r) => {
      const normalised = {};
      Object.keys(r).forEach((k) => {
        normalised[k.trim().toLowerCase().replace(/\s+/g, "_")] = r[k];
      });
      return normalised;
    });

    const result = await adminService.bulkCreateStaffService(req, rows);
    return res.json(result);
  } catch (err) {
    console.error("uploadStaffExcel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/profile ─────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const result = await adminService.getAdminProfileService(req);
    return res.json(result);
  } catch (err) {
    console.error("❌ getProfile error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/admin/profile ─────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { phone, currentPassword, newPassword, confirmPassword } = req.body;
    if (newPassword && newPassword !== confirmPassword)
      return res.status(400).json({ success: false, message: "New passwords do not match" });
    const result = await adminService.updateAdminProfileService(req, { phone, currentPassword, newPassword });
    return res.json(result);
  } catch (err) {
    console.error("❌ updateProfile error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST /api/admin/promote-batch ───────────────────────────────────────────
exports.promoteYearForBatch = async (req, res) => {
  try {
    const { batch, department } = req.body;
    if (!batch || !department) {
      return res.status(400).json({ success: false, message: "Batch and department are required" });
    }
    const staffService = require("../services/staff.service");
    const result = await staffService.promoteYearForBatchService(req, { batch, department });
    return res.json(result);
  } catch (err) {
    console.error("❌ promoteYearForBatch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};