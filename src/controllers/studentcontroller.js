// backend/src/controllers/student.controller.js
const bcrypt = require("bcrypt");
const { authPool, eventPool, callProcedure } = require("../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES (Inlined from student.service.js)
// ─────────────────────────────────────────────────────────────────────────────

async function getStudentProfileService(req) {
  const { username } = req.user;

  const rows = await callProcedure(eventPool, "sp_get_student_profile", [username]);

  if (!rows || rows.length === 0) {
    throw new Error("Student profile not found");
  }

  const p = rows[0];

  const { rows: credRows } = await authPool.query(
    `SELECT user_name, status FROM table_login WHERE user_name = $1 LIMIT 1`,
    [username]
  );
  const credRow = credRows[0];

  return {
    success: true,
    data: {
      username,
      rollNo:          p.roll_no          || "",
      firstName:       p.first_name       || "",
      lastName:        p.last_name        || "",
      fullName:        `${p.first_name || ""} ${p.last_name || ""}`.trim() || username,
      gender:          p.gender           || "",
      registrationNo:  p.registration_no  || "",
      course:          p.course           || "",
      currentYear:     Number(p.current_year) || 0,
      semester:        p.semester         || "",
      batch:           p.batch            || "",
      department:      p.department_name  || "",
      academicYearId:  p.academic_year_id || "",
      status:          credRow?.status    || "ACTIVE",
      createdOn:       p.created_on       || null,
      lastUpdatedBy:   p.last_updated_by  || null,
    },
  };
}

async function updateStudentProfileService(req, payload) {
  const { username } = req.user;
  const { first_name, last_name, registration_no, gender } = payload;

  const rows = await callProcedure(eventPool, "sp_update_student_profile", [
    username,
    (first_name || "").trim(),
    (last_name || "").trim(),
    (registration_no || "").trim(),
    (gender || "").trim(),
  ]);
  const outRow = rows[0];

  if (!outRow || !outRow.p_success) {
    throw new Error(outRow?.p_message || "Profile update failed");
  }

  return { success: true, message: "Profile updated successfully" };
}

async function changeStudentPasswordService(req, payload) {
  const { username } = req.user;
  const { currentPassword, newPassword } = payload;

  if (!currentPassword) throw new Error("Current password is required");
  if (!newPassword || newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters");
  }

  const { rows } = await authPool.query(
    `SELECT password FROM table_login WHERE user_name = $1 LIMIT 1`,
    [username]
  );
  const credRow = rows[0];
  if (!credRow) throw new Error("Student credentials not found");

  const isMatch = await bcrypt.compare(currentPassword, credRow.password);
  if (!isMatch) throw new Error("Current password is incorrect");

  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
  const newHash = await bcrypt.hash(newPassword, saltRounds);

  await authPool.query(
    `UPDATE table_login SET password = $1, last_updated_by = $2 WHERE user_name = $3`,
    [newHash, username, username]
  );

  return { success: true, message: "Password changed successfully" };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

// ─── GET /api/student/profile ─────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const result = await getStudentProfileService(req);
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
    const result = await updateStudentProfileService(req, {
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
    const result = await changeStudentPasswordService(req, {
      currentPassword,
      newPassword,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ student.changePassword error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};
