// backend/src/modules/students/student.service.js
// ALL database logic lives in Postgres functions.
// This file ONLY calls functions for business logic — pg placeholders ($1,$2..)
// instead of mysql2's `?`.

const bcrypt = require("bcrypt");
const { authPool, eventPool, callProcedure } = require("../../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// GET STUDENT PROFILE SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.getStudentProfileService = async (req) => {
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
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE STUDENT PROFILE SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.updateStudentProfileService = async (req, payload) => {
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
};

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE STUDENT PASSWORD SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.changeStudentPasswordService = async (req, payload) => {
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
};
