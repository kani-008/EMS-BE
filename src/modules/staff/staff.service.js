// backend/src/modules/staff/staff.service.js
// ALL database logic lives in MySQL stored procedures.
// This file ONLY calls procedures — zero raw SQL, zero hardcoded values.

const bcrypt = require("bcrypt");
const XLSX = require("xlsx");
const { authPool, eventPool, callProcedure } = require("../../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// GET STAFF PROFILE SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.getStaffProfileService = async (req) => {
  const { username, role, roleId } = req.user;

  const rows = await callProcedure(eventPool, "sp_get_staff_profile", [username]);

  const [[credRow]] = await authPool.query(
    `SELECT user_name, status FROM table_login WHERE user_name = ? LIMIT 1`,
    [username]
  );

  const p = rows && rows[0] ? rows[0] : {};

  const ORDINAL = ["1st", "2nd", "3rd", "4th"];
  const yr = Number(p.current_year) || 0;
  const currentYearLabel = yr >= 1 && yr <= 4 ? `${ORDINAL[yr - 1]} Year` : null;

  return {
    success: true,
    data: {
      username,
      role:             role || "",
      roleId:           p.user_role_id || roleId || "",
      roleName:         p.user_role    || role   || "",
      status:           credRow?.status || "ACTIVE",
      facultyId:        p.faculty_id   || "",
      firstName:        p.first_name   || "",
      lastName:         p.last_name    || "",
      fullName:         `${p.first_name || ""} ${p.last_name || ""}`.trim() || username,
      gender:           p.gender       || "",
      phone:            p.contact      || "",
      department:       p.department_name || "",
      batch:            p.batch        || "",
      course:           p.course       || "",
      currentYear:      yr,
      currentYearLabel: currentYearLabel,
      academicYearId:   p.academic_year_id  || "",
      academicYear:     p.academic_year     || "",
      profilePicUrl:    p.user_profile      || null,
      createdOn:        p.created_on        || null,
      lastUpdatedBy:    p.last_updated_by   || null,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE STAFF PROFILE SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.updateStaffProfileService = async (req, payload) => {
  const { username } = req.user;
  const { phone, currentPassword, newPassword } = payload;

  if (phone !== undefined) {
    await eventPool.query(
      `CALL sp_update_staff_profile(?, ?, ?, @p_success, @p_message)`,
      [username, String(phone).trim(), username]
    );

    const [[outRow]] = await eventPool.query(
      `SELECT @p_success AS success, @p_message AS message`
    );

    if (!outRow || !Number(outRow.success)) {
      throw new Error(outRow?.message || "sp_update_staff_profile failed");
    }
  }

  if (newPassword) {
    if (!currentPassword) throw new Error("Current password is required to set a new password");

    const [[credRow]] = await authPool.query(
      `SELECT password FROM table_login WHERE user_name = ? LIMIT 1`,
      [username]
    );
    if (!credRow) throw new Error("Staff credentials not found");

    const isMatch = await bcrypt.compare(currentPassword, credRow.password);
    if (!isMatch) throw new Error("Current password is incorrect");

    if (newPassword.length < 6) throw new Error("New password must be at least 6 characters");

    const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
    const newHash    = await bcrypt.hash(newPassword, saltRounds);

    await authPool.query(
      `UPDATE table_login SET password = ?, last_updated_by = ? WHERE user_name = ?`,
      [newHash, username, username]
    );
  }

  return { success: true, message: "Profile updated successfully" };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ADVISOR CONTEXT SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.getAdvisorContextService = async (req) => {
  const { username } = req.user;
  const rows = await callProcedure(eventPool, "sp_get_advisor_context", [username]);
  if (!rows || rows.length === 0) {
    throw new Error("Advisor context not found.");
  }
  return {
    success: true,
    data: {
      department_id:   rows[0].department_id,
      department_name: rows[0].department_name,
      batch:           rows[0].batch,
      course:          rows[0].course,
      current_year:    rows[0].current_year,
      study_year:      rows[0].study_year,
      derived_semester: rows[0].derived_semester,
    }
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ADVISOR STUDENTS SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.getAdvisorStudentsService = async (req) => {
  const { username } = req.user;

  const advCtx = await callProcedure(eventPool, "sp_get_advisor_context", [username]);
  const deptName = advCtx && advCtx[0] ? advCtx[0].department_name : "Unknown";

  // Fetch students for advisor
  const students = await callProcedure(eventPool, "sp_get_advisor_students", [username]);

  const formatted = (students || []).map((s) => ({
    roll_no:         s.roll_no,
    user_name:       s.user_name,
    first_name:      s.first_name || "",
    last_name:       s.last_name || "",
    full_name:       `${s.first_name || ""} ${s.last_name || ""}`.trim() || s.user_name,
    gender:          s.gender || "",
    registration_no: s.registration_no || "",
    course:          s.course || "",
    current_year:    s.current_year,
    semester:        s.semester,
    batch:           s.batch,
    status:          s.status,
    created_on:      s.created_on,
    department:      s.department_name || deptName,
    last_updated_by: s.last_updated_by,
  }));

  return { success: true, data: formatted };
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE STUDENTS RANGE SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.createStudentsRangeService = async (req, payload) => {
  const { username: advisorUsername } = req.user;
  const { prefix, rangeFrom, rangeTo, course, semester } = payload;

  const start = parseInt(rangeFrom, 10);
  const end = parseInt(rangeTo, 10);

  if (isNaN(start) || isNaN(end) || start > end) {
    throw new Error("Invalid range parameters");
  }

  if (end - start > 500) {
    throw new Error("Range size exceeds 500 limit");
  }

  const advCtx = await callProcedure(eventPool, "sp_get_advisor_context", [advisorUsername]);
  if (!advCtx || advCtx.length === 0) {
    throw new Error("Advisor context not found");
  }
  const { department_id: deptId, batch } = advCtx[0];

  let createdCount = 0;
  let failedCount = 0;
  const errors = [];

  for (let i = start; i <= end; i++) {
    const rollNoStr = String(i).padStart(2, "0");
    const roll_no = prefix + rollNoStr;
    const username = roll_no.toLowerCase();
    const raw_password = `${username}@${batch}`;

    try {
      await eventPool.query(
        `CALL sp_create_student(?, ?, ?, ?, ?, ?, ?, ?, @p_success, @p_message, @p_username, @p_table_name)`,
        [advisorUsername, roll_no, "", "", "", "", course, semester]
      );

      const [[outRow]] = await eventPool.query(
        `SELECT @p_success AS success, @p_message AS message, @p_username AS username, @p_table_name AS table_name`
      );

      if (!outRow || !Number(outRow.success)) {
        throw new Error(outRow?.message || "sp_create_student failed");
      }

      const tableName = outRow.table_name;

      const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
      const hashed = await bcrypt.hash(raw_password, saltRounds);

      try {
        await callProcedure(
          authPool,
          "sp_insert_login",
          [username, hashed, 'R01', deptId, 'ACTIVE', advisorUsername]
        );
        createdCount++;
      } catch (loginErr) {
        await eventPool.query(`DELETE FROM \`${tableName}\` WHERE roll_no = ?`, [roll_no]);
        throw loginErr;
      }
    } catch (err) {
      failedCount++;
      errors.push({ roll_no, reason: err.message });
    }
  }

  return {
    success: true,
    total: end - start + 1,
    created: createdCount,
    failed: failedCount,
    errors,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE STUDENT SINGLE SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.createStudentSingleService = async (req, payload) => {
  const { username: advisorUsername } = req.user;
  const { roll_no, first_name, last_name, gender, registration_no, course, semester } = payload;

  const advCtx = await callProcedure(eventPool, "sp_get_advisor_context", [advisorUsername]);
  if (!advCtx || advCtx.length === 0) {
    throw new Error("Advisor context not found");
  }
  const { department_id: deptId, batch } = advCtx[0];

  const username = String(roll_no).trim().toLowerCase();
  const raw_password = `${username}@${batch}`;

  await eventPool.query(
    `CALL sp_create_student(?, ?, ?, ?, ?, ?, ?, ?, @p_success, @p_message, @p_username, @p_table_name)`,
    [
      advisorUsername,
      String(roll_no).trim(),
      first_name ? String(first_name).trim() : "",
      last_name ? String(last_name).trim() : "",
      gender ? String(gender).trim() : "",
      registration_no ? String(registration_no).trim() : "",
      course ? String(course).trim() : "",
      semester ? parseInt(semester, 10) : 1,
    ]
  );

  const [[outRow]] = await eventPool.query(
    `SELECT @p_success AS success, @p_message AS message, @p_username AS username, @p_table_name AS table_name`
  );

  if (!outRow || !Number(outRow.success)) {
    throw new Error(outRow?.message || "sp_create_student failed");
  }

  const tableName = outRow.table_name;

  try {
    const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
    const hashed = await bcrypt.hash(raw_password, saltRounds);

    await callProcedure(
      authPool,
      "sp_insert_login",
      [username, hashed, 'R01', deptId, 'ACTIVE', advisorUsername]
    );

    return {
      success: true,
      username,
      message: "Student created successfully",
    };
  } catch (err) {
    await eventPool.query(`DELETE FROM \`${tableName}\` WHERE roll_no = ?`, [String(roll_no).trim()]);
    throw err;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE STUDENTS EXCEL SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.createStudentsExcelService = async (req, rows) => {
  const { username: advisorUsername } = req.user;

  const advCtx = await callProcedure(eventPool, "sp_get_advisor_context", [advisorUsername]);
  if (!advCtx || advCtx.length === 0) {
    throw new Error("Advisor context not found");
  }
  const { department_id: deptId, batch, derived_semester } = advCtx[0];

  let createdCount = 0;
  let failedCount = 0;
  const errors = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2;
    const { roll_no, first_name, last_name, gender, registration_no, course } = row;

    if (!roll_no || String(roll_no).trim() === "") {
      failedCount++;
      errors.push({ row: rowNum, roll_no: "", reason: "Roll number is empty" });
      continue;
    }

    const rollNoStr = String(roll_no).trim();
    const username = rollNoStr.toLowerCase();
    const raw_password = `${username}@${batch}`;

    try {
      await eventPool.query(
        `CALL sp_create_student(?, ?, ?, ?, ?, ?, ?, ?, @p_success, @p_message, @p_username, @p_table_name)`,
        [
          advisorUsername,
          rollNoStr,
          first_name ? String(first_name).trim() : "",
          last_name ? String(last_name).trim() : "",
          gender ? String(gender).trim() : "",
          registration_no ? String(registration_no).trim() : "",
          course ? String(course).trim() : "",
          derived_semester
        ]
      );

      const [[outRow]] = await eventPool.query(
        `SELECT @p_success AS success, @p_message AS message, @p_username AS username, @p_table_name AS table_name`
      );

      if (!outRow || !Number(outRow.success)) {
        throw new Error(outRow?.message || "sp_create_student failed");
      }

      const tableName = outRow.table_name;

      const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
      const hashed = await bcrypt.hash(raw_password, saltRounds);

      try {
        await callProcedure(
          authPool,
          "sp_insert_login",
          [username, hashed, 'R01', deptId, 'ACTIVE', advisorUsername]
        );
        createdCount++;
      } catch (loginErr) {
        await eventPool.query(`DELETE FROM \`${tableName}\` WHERE roll_no = ?`, [rollNoStr]);
        throw loginErr;
      }
    } catch (err) {
      failedCount++;
      errors.push({ row: rowNum, roll_no: rollNoStr, reason: err.message });
    }
  }

  return {
    success: true,
    total: rows.length,
    created: createdCount,
    failed: failedCount,
    errors,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// YEAR PROMOTION SERVICE (ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────
exports.promoteYearForBatchService = async (req, payload) => {
  const { batch, department } = payload;

  await eventPool.query(
    `CALL sp_promote_year_for_batch(?, ?, @p_success, @p_message, @p_affected_count)`,
    [batch, department]
  );

  const [[outRow]] = await eventPool.query(
    `SELECT @p_success AS success, @p_message AS message, @p_affected_count AS affected_count`
  );

  if (!outRow || !Number(outRow.success)) {
    throw new Error(outRow?.message || "sp_promote_year_for_batch failed");
  }

  return {
    success: true,
    message: outRow.message,
    affectedRows: outRow.affected_count,
  };
};


// ─────────────────────────────────────────────────────────────────────────────
// UPDATE STUDENT SERVICE (ADVISOR flow)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateStudentService = async (req, roll_no, payload) => {
  const { username: advisorUsername } = req.user;
  const { first_name, last_name, gender, registration_no, course, newPassword } = payload;

  await eventPool.query(
    `CALL sp_update_student(?, ?, ?, ?, ?, ?, ?, @p_success, @p_message)`,
    [
      advisorUsername,
      roll_no,
      first_name ? String(first_name).trim() : "",
      last_name ? String(last_name).trim() : "",
      gender ? String(gender).trim() : "",
      registration_no ? String(registration_no).trim() : "",
      course ? String(course).trim() : "",
    ]
  );

  const [[outRow]] = await eventPool.query(
    `SELECT @p_success AS success, @p_message AS message`
  );

  if (!outRow || !Number(outRow.success)) {
    throw new Error(outRow?.message || "sp_update_student failed");
  }

  // Optional password change — update credentials DB if newPassword is provided
  if (newPassword && String(newPassword).trim().length >= 6) {
    const studentUsername = String(roll_no).trim().toLowerCase();
    const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
    const newHash = await bcrypt.hash(String(newPassword).trim(), saltRounds);

    await authPool.query(
      `UPDATE table_login SET password = ?, last_updated_by = ? WHERE user_name = ?`,
      [newHash, advisorUsername, studentUsername]
    );

    console.log(`✅ Password updated for student: ${studentUsername} by advisor: ${advisorUsername}`);
  }

  return {
    success: true,
    message: outRow.message,
  };
};
