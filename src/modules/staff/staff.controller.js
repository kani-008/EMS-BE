// backend/src/modules/staff/staff.controller.js

const staffService = require("./staff.service");
const XLSX = require("xlsx");

// ─── GET /api/staff/profile ───────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const result = await staffService.getStaffProfileService(req);
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.getProfile error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/staff/profile ───────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { phone, currentPassword, newPassword, confirmPassword } = req.body;
    if (newPassword && newPassword !== confirmPassword)
      return res.status(400).json({ success: false, message: "New passwords do not match" });
    const result = await staffService.updateStaffProfileService(req, { phone, currentPassword, newPassword });
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.updateProfile error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// ─── GET /api/staff/advisor-context ──────────────────────────────────────────
exports.getAdvisorContext = async (req, res) => {
  try {
    const result = await staffService.getAdvisorContextService(req);
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.getAdvisorContext error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/staff/students ──────────────────────────────────────────────────
exports.getAdvisorStudents = async (req, res) => {
  try {
    const result = await staffService.getAdvisorStudentsService(req);
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.getAdvisorStudents error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/staff/students/range ───────────────────────────────────────────
exports.createStudentsRange = async (req, res) => {
  try {
    const { prefix, range_from, range_to, course, semester } = req.body;
    if (!prefix || range_from === undefined || range_to === undefined) {
      return res.status(400).json({ success: false, message: "Missing prefix or range limits" });
    }
    const result = await staffService.createStudentsRangeService(req, {
      prefix,
      rangeFrom: range_from,
      rangeTo: range_to,
      course,
      semester,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.createStudentsRange error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/staff/students/single ──────────────────────────────────────────
exports.createStudentSingle = async (req, res) => {
  try {
    const { roll_no, first_name, last_name, gender, registration_no, course, semester } = req.body;
    if (!roll_no) {
      return res.status(400).json({ success: false, message: "Roll number is required" });
    }
    const result = await staffService.createStudentSingleService(req, {
      roll_no,
      first_name,
      last_name,
      gender,
      registration_no,
      course,
      semester,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.createStudentSingle error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/staff/students/excel ───────────────────────────────────────────
exports.createStudentsExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const ext = req.file.originalname.split(".").pop().toLowerCase();
    if (!["xlsx", "csv"].includes(ext)) {
      return res.status(400).json({ success: false, message: "Only .xlsx and .csv files are accepted." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

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

    const result = await staffService.createStudentsExcelService(req, rows);
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.createStudentsExcel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/staff/students/excel-template ──────────────────────────────────
exports.downloadExcelTemplate = async (req, res) => {
  try {
    const headers = [
      ["roll_no", "first_name", "last_name", "gender", "registration_no", "course", "semester"]
    ];
    const sampleRow = ["23CSE101", "John", "Doe", "Male", "910023104001", "B.E", "5"];
    headers.push(sampleRow);

    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", 'attachment; filename="student_template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (err) {
    console.error("❌ staff.downloadExcelTemplate error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/staff/students/:roll_no ──────────────────────────────────────────
exports.updateStudent = async (req, res) => {
  try {
    const { roll_no } = req.params;
    const { first_name, last_name, gender, registration_no, course, newPassword } = req.body;
    if (!roll_no) {
      return res.status(400).json({ success: false, message: "Roll number parameter is required" });
    }
    const result = await staffService.updateStudentService(req, roll_no, {
      first_name,
      last_name,
      gender,
      registration_no,
      course,
      newPassword,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.updateStudent error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};
