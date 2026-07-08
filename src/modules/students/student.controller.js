// backend/src/modules/students/student.controller.js

const studentService = require("./student.service");

// ─── GET /api/student/profile ─────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const result = await studentService.getStudentProfileService(req);
    return res.json(result);
  } catch (err) {
    console.error("❌ student.getProfile error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/student/profile ─────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { first_name, last_name, registration_no, gender } = req.body;
    const result = await studentService.updateStudentProfileService(req, {
      first_name,
      last_name,
      registration_no,
      gender,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ student.updateProfile error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/student/profile/password ────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (newPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "New passwords do not match" });
    }
    const result = await studentService.changeStudentPasswordService(req, {
      currentPassword,
      newPassword,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ student.changePassword error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};
