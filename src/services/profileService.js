// src/services/profileService.js
// Business logic for profile reads and updates across all roles.
// No req/res handling. All functions return data or throw.

const bcrypt = require("bcrypt");
const { authPool, eventPool, callProcedure } = require("../config/db");

// ── Shared constants ──────────────────────────────────────────────────────────
const STAFF_ROLES = ["ADVISOR", "HOD", "PRINCIPAL", "FACULTY", "PLACEMENT", "SPORTS"];

// ── Student Services ──────────────────────────────────────────────────────────

async function getStudentProfileService(username) {
  const rows = await callProcedure(eventPool, "sp_get_student_profile", [username]);
  if (!rows || rows.length === 0) {
    throw new Error("Student profile not found");
  }
  const p = rows[0];
  const { rows: credRows } = await authPool.query(
    `SELECT user_name, status FROM credentials.table_login WHERE user_name = $1 LIMIT 1`,
    [username]
  );
  const credRow = credRows[0];
  return {
    success: true,
    data: {
      username,
      rollNo:         p.roll_no         || "",
      firstName:      p.first_name      || "",
      lastName:       p.last_name       || "",
      fullName:       `${p.first_name || ""} ${p.last_name || ""}`.trim() || username,
      gender:         p.gender          || "",
      registrationNo: p.registration_no || "",
      course:         p.course          || "",
      currentYear:    Number(p.current_year) || 0,
      semester:       p.semester        || "",
      batch:          p.batch           || "",
      department:     p.department_name || "",
      academicYearId: p.academic_year_id || "",
      status:         credRow?.status   || "ACTIVE",
      createdOn:      p.created_on      || null,
      lastUpdatedBy:  p.last_updated_by || null,
    },
  };
}

async function updateStudentProfileService(username, payload) {
  const { first_name, last_name, registration_no, gender } = payload;
  const rows = await callProcedure(eventPool, "sp_update_student_profile", [
    username,
    (first_name      || "").trim(),
    (last_name       || "").trim(),
    (registration_no || "").trim(),
    (gender          || "").trim(),
  ]);
  const outRow = rows[0];
  if (!outRow || !outRow.p_success) {
    throw new Error(outRow?.p_message || "Profile update failed");
  }
  return { success: true, message: "Profile updated successfully" };
}

async function changeStudentPasswordService(username, payload) {
  const { currentPassword, newPassword } = payload;
  if (!currentPassword) throw new Error("Current password is required");
  if (!newPassword || newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters");
  }
  const { rows } = await authPool.query(
    `SELECT password FROM credentials.table_login WHERE user_name = $1 LIMIT 1`,
    [username]
  );
  const credRow = rows[0];
  if (!credRow) throw new Error("Student credentials not found");

  const isMatch = await bcrypt.compare(currentPassword, credRow.password);
  if (!isMatch) throw new Error("Current password is incorrect");

  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
  const newHash    = await bcrypt.hash(newPassword, saltRounds);

  await authPool.query(
    `UPDATE credentials.table_login SET password = $1, last_updated_by = $2, must_change_password = false WHERE user_name = $3`,
    [newHash, username, username]
  );
  return { success: true, message: "Password changed successfully" };
}

// ── Staff Services ────────────────────────────────────────────────────────────

async function getStaffProfileService(username, role, roleId) {
  const rows = await callProcedure(eventPool, "sp_get_staff_profile", [username]);
  const { rows: credRows } = await authPool.query(
    `SELECT user_name, status FROM credentials.table_login WHERE user_name = $1 LIMIT 1`,
    [username]
  );
  const credRow = credRows[0];
  const p = rows && rows[0] ? rows[0] : {};

  const ORDINAL = ["1st", "2nd", "3rd", "4th"];
  const yr = Number(p.current_year) || 0;
  const currentYearLabel = yr >= 1 && yr <= 4 ? `${ORDINAL[yr - 1]} Year` : null;

  return {
    success: true,
    data: {
      username,
      role:             role             || "",
      roleId:           p.user_role_id   || roleId || "",
      roleName:         p.user_role      || role   || "",
      status:           credRow?.status  || "ACTIVE",
      facultyId:        p.faculty_id     || "",
      firstName:        p.first_name     || "",
      lastName:         p.last_name      || "",
      fullName:         `${p.first_name || ""} ${p.last_name || ""}`.trim() || username,
      gender:           p.gender         || "",
      phone:            p.contact        || "",
      department:       p.department_name || "",
      batch:            p.batch          || "",
      course:           p.course         || "",
      currentYear:      yr,
      currentYearLabel: currentYearLabel,
      academicYearId:   p.academic_year_id || "",
      academicYear:     p.academic_year    || "",
      profilePicUrl:    p.user_profile     || null,
      createdOn:        p.created_on       || null,
      lastUpdatedBy:    p.last_updated_by  || null,
    },
  };
}

async function updateStaffProfileService(username, payload) {
  const { phone, currentPassword, newPassword } = payload;

  if (phone !== undefined) {
    const rows = await callProcedure(eventPool, "sp_update_staff_profile", [
      username, String(phone).trim(), username,
    ]);
    const outRow = rows[0];
    if (!outRow || !outRow.p_success) {
      throw new Error(outRow?.p_message || "sp_update_staff_profile failed");
    }
  }

  if (newPassword) {
    if (!currentPassword) throw new Error("Current password is required to set a new password");

    const { rows } = await authPool.query(
      `SELECT password FROM credentials.table_login WHERE user_name = $1 LIMIT 1`,
      [username]
    );
    const credRow = rows[0];
    if (!credRow) throw new Error("Staff credentials not found");

    const isMatch = await bcrypt.compare(currentPassword, credRow.password);
    if (!isMatch) throw new Error("Current password is incorrect");

    if (newPassword.length < 6) throw new Error("New password must be at least 6 characters");

    const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
    const newHash    = await bcrypt.hash(newPassword, saltRounds);

    await authPool.query(
      `UPDATE credentials.table_login SET password = $1, last_updated_by = $2, must_change_password = false WHERE user_name = $3`,
      [newHash, username, username]
    );
  }
  return { success: true, message: "Profile updated successfully" };
}

// ── Admin Services ────────────────────────────────────────────────────────────

async function getAdminProfileService(username, role, roleId) {
  const { rows: credRows } = await authPool.query(
    `SELECT user_name, user_role_id, status, first_name, last_name, gender
     FROM credentials.table_login WHERE user_name = $1 LIMIT 1`,
    [username]
  );
  const credRow = credRows[0];

  return {
    success: true,
    data: {
      username,
      role,
      roleId:    credRow?.user_role_id || roleId,
      status:    credRow?.status       || "ACTIVE",
      firstName: credRow?.first_name   || "",
      lastName:  credRow?.last_name    || "",
      fullName:  `${credRow?.first_name || ""} ${credRow?.last_name || ""}`.trim() || username,
      gender:    credRow?.gender       || "",
    },
  };
}

async function updateAdminProfileService(username, payload) {
  const { firstName, lastName, gender, currentPassword, newPassword } = payload;

  if (firstName !== undefined || lastName !== undefined || gender !== undefined) {
    await authPool.query(
      `UPDATE credentials.table_login
         SET first_name = COALESCE($1, first_name),
             last_name  = COALESCE($2, last_name),
             gender     = COALESCE($3, gender),
             last_updated_by = $4
       WHERE user_name = $4`,
      [
        firstName !== undefined ? String(firstName).trim() : null,
        lastName  !== undefined ? String(lastName).trim()  : null,
        gender    !== undefined ? String(gender).trim()    : null,
        username,
      ]
    );
  }

  if (newPassword) {
    if (!currentPassword) throw new Error("Current password is required to set a new password");

    const { rows } = await authPool.query(
      `SELECT password FROM credentials.table_login WHERE user_name = $1 LIMIT 1`,
      [username]
    );
    const credRow = rows[0];
    if (!credRow) throw new Error("Admin credentials not found");

    const isMatch = await bcrypt.compare(currentPassword, credRow.password);
    if (!isMatch) throw new Error("Current password is incorrect");

    if (newPassword.length < 6) throw new Error("New password must be at least 6 characters");

    const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
    const newHash    = await bcrypt.hash(newPassword, saltRounds);

    await authPool.query(
      `UPDATE credentials.table_login SET password = $1, last_updated_by = $2, must_change_password = false WHERE user_name = $3`,
      [newHash, username, username]
    );
  }
  return { success: true, message: "Profile updated successfully" };
}

module.exports = {
  STAFF_ROLES,
  getStudentProfileService,
  updateStudentProfileService,
  changeStudentPasswordService,
  getStaffProfileService,
  updateStaffProfileService,
  getAdminProfileService,
  updateAdminProfileService,
};
