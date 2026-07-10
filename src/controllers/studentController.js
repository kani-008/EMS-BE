// src/controllers/studentController.js
// Express request handlers for student routes.
// All business logic lives in src/services/studentService.js.

const XLSX = require("xlsx");
const {
  createUsersService,
  createStudentsRangeService,
  createStudentSingleService,
  createStudentsExcelService,
  updateStudentService,
  promoteYearForBatchService,
  getAdvisorStudentsService,
  updateStudentStatusService,
} = require("../services/studentService");

exports.createStudents = async (req, res) => {
  try {
    const { prefix, userType, rangeFrom, rangeTo, course, semester, batch, department } = req.body;
    const result = await createUsersService(req.user, {
      prefix, userType, rangeFrom, rangeTo, course, semester, batch, department,
    });
    return res.json(result);
  } catch (err) {
    console.error("createStudents error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAdvisorStudents = async (req, res) => {
  try {
    const result = await getAdvisorStudentsService(req.user.username);
    return res.json(result);
  } catch (err) {
    console.error("❌ getAdvisorStudents error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStudentsRange = async (req, res) => {
  try {
    const { prefix, range_from, range_to, course, semester, batch, department } = req.body;
    if (!prefix || range_from === undefined || range_to === undefined) {
      return res.status(400).json({ success: false, message: "Missing prefix or range limits" });
    }
    const result = await createStudentsRangeService(req.user, {
      prefix, rangeFrom: range_from, rangeTo: range_to, course, semester, batch, department,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ createStudentsRange error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStudentSingle = async (req, res) => {
  try {
    const { roll_no, first_name, last_name, gender, registration_no, course, semester, batch, department } = req.body;
    if (!roll_no) {
      return res.status(400).json({ success: false, message: "Roll number is required" });
    }
    const result = await createStudentSingleService(req.user, {
      roll_no, first_name, last_name, gender, registration_no, course, semester, batch, department,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ createStudentSingle error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStudentsExcel = async (req, res) => {
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

    // Pass bodyOverrides for admin dept/batch/course/semester context
    const bodyOverrides = {
      department: req.body.department,
      batch:      req.body.batch,
      course:     req.body.course,
      semester:   req.body.semester,
    };

    const result = await createStudentsExcelService(req.user, rows, bodyOverrides);
    return res.json(result);
  } catch (err) {
    console.error("❌ createStudentsExcel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.downloadExcelTemplate = async (req, res) => {
  try {
    const headers   = [["roll_no", "first_name", "last_name", "gender", "registration_no", "course", "semester"]];
    const sampleRow = ["23CSE101", "John", "Doe", "Male", "910023104001", "B.E", "5"];
    headers.push(sampleRow);

    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    const workbook  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", 'attachment; filename="student_template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (err) {
    console.error("❌ downloadExcelTemplate error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { roll_no } = req.params;
    const { first_name, last_name, gender, registration_no, course, newPassword } = req.body;
    if (!roll_no) {
      return res.status(400).json({ success: false, message: "Roll number parameter is required" });
    }
    const result = await updateStudentService(req.user, roll_no, {
      first_name, last_name, gender, registration_no, course, newPassword,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ updateStudent error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.promoteBatch = async (req, res) => {
  try {
    const { batch, department } = req.body;
    if (!batch || !department) {
      return res.status(400).json({ success: false, message: "Batch and department are required" });
    }
    const result = await promoteYearForBatchService(batch, department);
    return res.json(result);
  } catch (err) {
    console.error("❌ promoteBatch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateStudentStatus = async (req, res) => {
  try {
    const { roll_no } = req.params;
    const { status }  = req.body;

    if (!roll_no || !status) {
      return res.status(400).json({ success: false, message: "Roll number and status are required" });
    }

    const targetStatus = String(status).toUpperCase();
    if (targetStatus !== "ACTIVE" && targetStatus !== "INACTIVE") {
      return res.status(400).json({ success: false, message: "Invalid status value. Must be ACTIVE or INACTIVE" });
    }

    const result = await updateStudentStatusService(req.user, roll_no, targetStatus);
    return res.json(result);
  } catch (err) {
    console.error("❌ updateStudentStatus error:", err.message);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};
