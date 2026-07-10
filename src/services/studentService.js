// src/services/studentService.js
// Business logic for student creation, update, status change, and queries.
// No req/res handling. All functions return data or throw.

const XLSX   = require("xlsx");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { authPool, eventPool, callProcedure } = require("../config/db");

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateRandomPassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const len   = 12;
  let pwd = "";
  const randomBytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) {
    pwd += chars[randomBytes[i] % chars.length];
  }
  return pwd;
}

function validateRange(rangeFrom, rangeTo) {
  const from = parseInt(rangeFrom, 10);
  const to   = parseInt(rangeTo,   10);
  if (isNaN(from) || isNaN(to) || from < 1 || to < 1 || from > to)
    throw new Error("Invalid range: rangeFrom and rangeTo must be positive integers, rangeFrom ≤ rangeTo");
  if (to - from + 1 > 500)
    throw new Error("Range too large: maximum 500 users per batch");
  return { from, to };
}

async function validateBatchService(batch, course) {
  const currentCalendarYear = new Date().getFullYear();
  const rows = await callProcedure(eventPool, "sp_validate_batch_and_year", [
    parseInt(batch, 10),
    String(course).trim(),
    currentCalendarYear,
  ]);
  const outRow  = rows[0];
  const isValid = outRow?.p_is_valid === true;

  return {
    success:     true,
    valid:       isValid,
    currentYear: isValid ? Number(outRow.p_current_year) : null,
    message:     outRow?.p_message || "",
  };
}

// ── Core student row creator (calls correct SP for admin vs advisor) ───────────

async function createOneStudentGeneric({
  creatorUsername,
  isAdmin,
  departmentId,
  rollNo,
  firstName,
  lastName,
  gender,
  registrationNo,
  academicYearId,
  currentYear,
  course,
  semester,
  batch,
}) {
  const spName   = isAdmin ? "sp_create_student_user_admin" : "sp_create_student_user";
  const spParams = isAdmin
    ? [
        rollNo,
        rollNo.toLowerCase(),
        firstName      || "",
        lastName       || "",
        gender         || "",
        registrationNo || "",
        academicYearId || null,
        currentYear,
        course         || "",
        semester       || null,
        batch,
        departmentId,
        creatorUsername,
      ]
    : [
        creatorUsername,
        rollNo,
        rollNo.toLowerCase(),
        firstName      || "",
        lastName       || "",
        gender         || "",
        registrationNo || "",
        academicYearId || null,
        currentYear,
        course         || "",
        semester       || null,
        batch,
        creatorUsername,
      ];

  const spRows = await callProcedure(eventPool, spName, spParams);
  const outRow = spRows[0];
  if (!outRow || !outRow.p_success) {
    throw new Error(outRow?.p_message || `${spName} failed`);
  }
  return outRow;
}

// ── Resolve caller context (dept/batch/year/academicYear) ─────────────────────

async function resolveCallerContext(callerUser, payload) {
  const isAdmin = callerUser.role === "ADMIN";
  const { department, batch: batchInput, course } = payload;

  if (isAdmin) {
    if (!department) throw new Error("department is required");
    if (!batchInput) throw new Error("batch is required");

    const deptRows = await callProcedure(eventPool, "sp_get_department_id_by_name", [department]);
    if (!deptRows || deptRows.length === 0) throw new Error("Department not found");
    const departmentId   = deptRows[0].department_id;
    const departmentName = deptRows[0].department_name;

    const valResult = await validateBatchService(batchInput, course || "B.E");
    if (!valResult.valid) throw new Error(valResult.message || "Invalid batch");
    const currentYear = valResult.currentYear;

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batchInput]);
    if (!ayRows || ayRows.length === 0)
      throw new Error(`Academic year not found for batch="${batchInput}". Ensure AY${batchInput} exists in academic_year table.`);
    const academicYearId = ayRows[0].academic_year_id;

    return { isAdmin, departmentId, departmentName, batch: batchInput, currentYear, academicYearId };
  } else {
    // Advisor: derive context from the advisor's own account
    const ctxRows = await callProcedure(eventPool, "sp_get_advisor_context", [callerUser.username]);
    if (!ctxRows || ctxRows.length === 0)
      throw new Error("Advisor context not found — ensure your account is registered in user_faculty");

    const ctx          = ctxRows[0];
    const departmentId   = ctx.department_id;
    const departmentName = ctx.department_name;
    const batch          = ctx.batch;
    const currentYear    = ctx.current_year;

    if (batchInput && String(ctx.batch) !== String(batchInput))
      throw new Error(`Batch mismatch: your assigned batch is "${ctx.batch}", cannot create students for batch "${batchInput}"`);

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
    if (!ayRows || ayRows.length === 0)
      throw new Error(`Academic year not found for batch="${batch}". Ensure AY${batch} exists in academic_year table.`);
    const academicYearId = ayRows[0].academic_year_id;

    return { isAdmin, departmentId, departmentName, batch, currentYear, academicYearId, derived_semester: ctx.derived_semester };
  }
}

// ── Create students (batch range, POST /) ─────────────────────────────────────

async function createUsersService(callerUser, payload) {
  const { prefix, userType, rangeFrom, rangeTo, course, semester } = payload;

  if (!prefix)   throw new Error("prefix is required");
  if (!userType) throw new Error("userType is required");
  if (!course)   throw new Error("course is required");
  if (!payload.batch) throw new Error("batch is required");
  if (userType !== "Range")
    throw new Error("Only 'Range' userType is currently supported");

  const { from, to } = validateRange(rangeFrom, rangeTo);

  const ctx = await resolveCallerContext(callerUser, payload);
  const { isAdmin, departmentId, batch, currentYear, academicYearId } = ctx;

  const saltRounds     = parseInt(process.env.BCRYPT_SALT || "10", 10);
  const insertedInAuth = [];
  const createdUsers   = [];
  let tableName = null;

  for (let i = from; i <= to; i++) {
    const paddedNum   = String(i).padStart(2, "0");
    const username    = `${prefix}${paddedNum}`;
    const rawPassword = generateRandomPassword();
    const hashedPwd   = await bcrypt.hash(rawPassword, saltRounds);

    try {
      const result = await callProcedure(authPool, "sp_insert_login", [
        username, hashedPwd, "R01", departmentId, "ACTIVE", callerUser.username,
      ]);
      const wasInserted = result && result[0] ? Number(result[0].inserted) : 1;
      if (wasInserted) {
        insertedInAuth.push(username);
        createdUsers.push({ username, password: rawPassword });

        // Explicitly set must_change_password for system-generated passwords
        await authPool.query(
          `UPDATE credentials.table_login SET must_change_password = true WHERE user_name = $1`,
          [username]
        );
      } else {
        console.warn(`  ⚠ auth duplicate skipped: ${username}`);
      }
    } catch (err) {
      throw new Error(`Credentials insert failed at ${username}: ${err.message}`);
    }

    try {
      const outRow = await createOneStudentGeneric({
        creatorUsername: callerUser.username,
        isAdmin,
        departmentId,
        rollNo:         username,
        firstName:      "",
        lastName:       "",
        gender:         "",
        registrationNo: "",
        academicYearId,
        currentYear,
        course,
        semester:       semester || null,
        batch,
      });
      tableName = outRow.p_table_name;
    } catch (err) {
      console.error(`❌ Event insert failed for ${username}:`, err.message);
      if (insertedInAuth.length > 0) {
        try {
          await callProcedure(authPool, "sp_rollback_logins", [insertedInAuth.join(",")]);
        } catch (rbErr) {
          throw new Error(`Event insert AND rollback BOTH failed — partial data in Credentials: ${rbErr.message}`);
        }
      }
      throw new Error(`Event_Management insert failed: ${err.message}`);
    }
  }

  return {
    success:      true,
    message:      `Successfully created ${insertedInAuth.length} students in ${tableName}`,
    createdUsers,
    totalCreated: insertedInAuth.length,
  };
}

// ── Create students range (POST /range) ───────────────────────────────────────

async function createStudentsRangeService(callerUser, payload) {
  const { prefix, rangeFrom, rangeTo, course, semester } = payload;

  const start = parseInt(rangeFrom, 10);
  const end   = parseInt(rangeTo,   10);

  if (isNaN(start) || isNaN(end) || start > end)
    throw new Error("Invalid range parameters");
  if (end - start > 500)
    throw new Error("Range size exceeds 500 limit");

  const ctx = await resolveCallerContext(callerUser, payload);
  const { isAdmin, departmentId, batch, currentYear, academicYearId } = ctx;

  let createdCount = 0;
  let failedCount  = 0;
  const succeeded  = [];
  const errors     = [];
  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);

  for (let i = start; i <= end; i++) {
    const rollNoStr = String(i).padStart(2, "0");
    const roll_no   = prefix + rollNoStr;
    const username  = roll_no.toLowerCase();

    try {
      const outRow = await createOneStudentGeneric({
        creatorUsername: callerUser.username,
        isAdmin,
        departmentId,
        rollNo:         roll_no,
        firstName:      "",
        lastName:       "",
        gender:         "",
        registrationNo: "",
        academicYearId,
        currentYear,
        course,
        semester,
        batch,
      });

      const rawPassword = generateRandomPassword();
      const hashed      = await bcrypt.hash(rawPassword, saltRounds);

      try {
        await callProcedure(authPool, "sp_insert_login", [username, hashed, "R01", departmentId, "ACTIVE", callerUser.username]);

        // Explicitly set must_change_password for system-generated passwords
        await authPool.query(
          `UPDATE credentials.table_login SET must_change_password = true WHERE user_name = $1`,
          [username]
        );

        succeeded.push({ roll_no, username, password: rawPassword });
        createdCount++;
      } catch (loginErr) {
        await eventPool.query(`DELETE FROM ${outRow.p_table_name} WHERE roll_no = $1`, [roll_no]);
        throw loginErr;
      }
    } catch (err) {
      failedCount++;
      errors.push({ roll_no, reason: err.message });
    }
  }

  return { success: true, total: end - start + 1, created: createdCount, failed: failedCount, succeeded, errors };
}

// ── Create single student (POST /single) ─────────────────────────────────────

async function createStudentSingleService(callerUser, payload) {
  const { roll_no, first_name, last_name, gender, registration_no, course, semester } = payload;

  const ctx = await resolveCallerContext(callerUser, payload);
  const { isAdmin, departmentId, batch, currentYear, academicYearId } = ctx;

  const username    = String(roll_no).trim().toLowerCase();
  const rawPassword = generateRandomPassword();
  const saltRounds  = parseInt(process.env.BCRYPT_SALT || "10", 10);
  const hashed      = await bcrypt.hash(rawPassword, saltRounds);

  const outRow = await createOneStudentGeneric({
    creatorUsername: callerUser.username,
    isAdmin,
    departmentId,
    rollNo:         String(roll_no).trim(),
    firstName:      first_name      ? String(first_name).trim()      : "",
    lastName:       last_name       ? String(last_name).trim()       : "",
    gender:         gender          ? String(gender).trim()          : "",
    registrationNo: registration_no ? String(registration_no).trim() : "",
    academicYearId,
    currentYear,
    course:         course   ? String(course).trim()       : "",
    semester:       semester ? parseInt(semester, 10)       : 1,
    batch,
  });

  try {
    await callProcedure(authPool, "sp_insert_login", [username, hashed, "R01", departmentId, "ACTIVE", callerUser.username]);

    // Explicitly set must_change_password for system-generated passwords
    await authPool.query(
      `UPDATE credentials.table_login SET must_change_password = true WHERE user_name = $1`,
      [username]
    );

    return { success: true, username, password: rawPassword, message: "Student created successfully" };
  } catch (err) {
    await eventPool.query(`DELETE FROM ${outRow.p_table_name} WHERE roll_no = $1`, [String(roll_no).trim()]);
    throw err;
  }
}

// ── Bulk create students from Excel (POST /excel) ─────────────────────────────

async function createStudentsExcelService(callerUser, rows, bodyOverrides) {
  const ctx = await resolveCallerContext(callerUser, bodyOverrides);
  const { isAdmin, departmentId, batch, currentYear, academicYearId, derived_semester } = ctx;

  // For admin, semester comes from bodyOverrides; for advisor from derived_semester
  const effectiveSemester = isAdmin
    ? (bodyOverrides.semester ? parseInt(bodyOverrides.semester, 10) : 1)
    : derived_semester;

  let createdCount = 0;
  let failedCount  = 0;
  const succeeded  = [];
  const errors     = [];
  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);

  for (let idx = 0; idx < rows.length; idx++) {
    const row    = rows[idx];
    const rowNum = idx + 2;
    const { roll_no, first_name, last_name, gender, registration_no, course } = row;

    if (!roll_no || String(roll_no).trim() === "") {
      failedCount++;
      errors.push({ row: rowNum, roll_no: "", reason: "Roll number is empty" });
      continue;
    }

    const rollNoStr     = String(roll_no).trim();
    const username      = rollNoStr.toLowerCase();
    const activeCourse  = course ? String(course).trim() : (bodyOverrides.course || "B.E");

    try {
      const outRow = await createOneStudentGeneric({
        creatorUsername: callerUser.username,
        isAdmin,
        departmentId,
        rollNo:         rollNoStr,
        firstName:      first_name      ? String(first_name).trim()      : "",
        lastName:       last_name       ? String(last_name).trim()       : "",
        gender:         gender          ? String(gender).trim()          : "",
        registrationNo: registration_no ? String(registration_no).trim() : "",
        academicYearId,
        currentYear,
        course:         activeCourse,
        semester:       effectiveSemester,
        batch,
      });

      const rawPassword = generateRandomPassword();
      const hashed      = await bcrypt.hash(rawPassword, saltRounds);

      try {
        await callProcedure(authPool, "sp_insert_login", [username, hashed, "R01", departmentId, "ACTIVE", callerUser.username]);

        // Explicitly set must_change_password for system-generated passwords
        await authPool.query(
          `UPDATE credentials.table_login SET must_change_password = true WHERE user_name = $1`,
          [username]
        );

        succeeded.push({ row: rowNum, roll_no: rollNoStr, username, password: rawPassword });
        createdCount++;
      } catch (loginErr) {
        await eventPool.query(`DELETE FROM ${outRow.p_table_name} WHERE roll_no = $1`, [rollNoStr]);
        throw loginErr;
      }
    } catch (err) {
      failedCount++;
      errors.push({ row: rowNum, roll_no: rollNoStr, reason: err.message });
    }
  }

  return { success: true, total: rows.length, created: createdCount, failed: failedCount, succeeded, errors };
}

// ── Update student details (PUT /:roll_no) ────────────────────────────────────

async function updateStudentService(callerUser, roll_no, payload) {
  const isAdmin = callerUser.role === "ADMIN";
  const { first_name, last_name, gender, registration_no, course, newPassword } = payload;

  if (isAdmin) {
    // Admin: resolve dept table directly from credentials
    const credRows = await authPool.query(
      "SELECT department_id FROM credentials.table_login WHERE user_name = $1 AND user_role_id = 'R01'",
      [String(roll_no).toLowerCase()]
    );
    if (credRows.rows.length === 0) throw new Error("Student not found in credentials");

    const deptRows = await eventPool.query(
      "SELECT department_name FROM event_management.department WHERE department_id = $1",
      [credRows.rows[0].department_id]
    );
    if (deptRows.rows.length === 0) throw new Error("Department not found for student");

    const tableName = `user_student_${deptRows.rows[0].department_name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

    const tableExists = await eventPool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'event_management' AND table_name = $1",
      [tableName]
    );
    if (tableExists.rows.length === 0) throw new Error("Student table does not exist");

    await eventPool.query(
      `UPDATE event_management.${tableName}
       SET first_name=$1, last_name=$2, gender=$3, registration_no=$4, course=$5, last_updated_by=$6
       WHERE roll_no=$7`,
      [
        first_name      ? String(first_name).trim()      : "",
        last_name       ? String(last_name).trim()       : "",
        gender          ? String(gender).trim()          : "",
        registration_no ? String(registration_no).trim() : "",
        course          ? String(course).trim()          : "",
        callerUser.username,
        roll_no,
      ]
    );
  } else {
    // Advisor: stored procedure validates batch/dept ownership
    const rows = await callProcedure(eventPool, "sp_update_student", [
      callerUser.username,
      roll_no,
      first_name      ? String(first_name).trim()      : "",
      last_name       ? String(last_name).trim()       : "",
      gender          ? String(gender).trim()          : "",
      registration_no ? String(registration_no).trim() : "",
      course          ? String(course).trim()          : "",
    ]);
    const outRow = rows[0];
    if (!outRow || !outRow.p_success) {
      throw new Error(outRow?.p_message || "sp_update_student failed");
    }
  }

  if (newPassword && String(newPassword).trim().length >= 6) {
    const studentUsername = String(roll_no).trim().toLowerCase();
    const saltRounds      = parseInt(process.env.BCRYPT_SALT || "10", 10);
    const newHash         = await bcrypt.hash(String(newPassword).trim(), saltRounds);

    await authPool.query(
      `UPDATE credentials.table_login SET password = $1, last_updated_by = $2, must_change_password = false WHERE user_name = $3`,
      [newHash, callerUser.username, studentUsername]
    );
  }

  return { success: true, message: "Student updated successfully" };
}

// ── Promote batch year (POST /promote-batch) ──────────────────────────────────

async function promoteYearForBatchService(batch, department) {
  const rows = await callProcedure(eventPool, "sp_promote_year_for_batch", [batch, department]);
  const outRow = rows[0];

  if (!outRow || !outRow.p_success) {
    throw new Error(outRow?.p_message || "sp_promote_year_for_batch failed");
  }

  return { success: true, message: outRow.p_message, affectedRows: outRow.p_affected_count };
}

// ── Get advisor's student list (GET /) ────────────────────────────────────────

async function getAdvisorStudentsService(username) {
  const advCtx  = await callProcedure(eventPool, "sp_get_advisor_context", [username]);
  const deptName = advCtx && advCtx[0] ? advCtx[0].department_name : "Unknown";

  const students = await callProcedure(eventPool, "sp_get_advisor_students", [username]);

  const formatted = (students || []).map((s) => ({
    roll_no:         s.roll_no,
    user_name:       s.user_name,
    first_name:      s.first_name      || "",
    last_name:       s.last_name       || "",
    full_name:       `${s.first_name || ""} ${s.last_name || ""}`.trim() || s.user_name,
    gender:          s.gender          || "",
    registration_no: s.registration_no || "",
    course:          s.course          || "",
    current_year:    s.current_year,
    semester:        s.semester,
    batch:           s.batch,
    status:          s.status,
    created_on:      s.created_on,
    department:      s.department_name || deptName,
    last_updated_by: s.last_updated_by,
  }));

  return { success: true, data: formatted };
}

// ── Student status toggle (PATCH /:roll_no/status) ────────────────────────────

async function updateStudentStatusService(callerUser, roll_no, targetStatus) {
  const { rows } = await authPool.query(
    "SELECT user_name, department_id FROM credentials.table_login WHERE user_name = $1 AND user_role_id = 'R01'",
    [String(roll_no).toLowerCase()]
  );
  if (rows.length === 0) throw new Error("Student credentials not found");

  const departmentId = rows[0].department_id;
  let tableName;

  if (callerUser.role === "ADVISOR") {
    const advCtxRows = await callProcedure(eventPool, "sp_get_advisor_context", [callerUser.username]);
    const advCtx     = advCtxRows[0];
    if (!advCtx || advCtx.department_id !== departmentId) {
      throw Object.assign(new Error("Unauthorized: student is in a different department"), { statusCode: 403 });
    }

    tableName = `user_student_${advCtx.department_name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const studentCheck = await eventPool.query(
      `SELECT 1 FROM event_management.${tableName} WHERE roll_no = $1 AND batch = $2`,
      [roll_no, advCtx.batch]
    );
    if (studentCheck.rows.length === 0) {
      throw Object.assign(new Error("Unauthorized: student is not in your assigned batch"), { statusCode: 403 });
    }
  } else if (callerUser.role === "ADMIN") {
    const deptRows = await eventPool.query(
      "SELECT department_name FROM event_management.department WHERE department_id = $1",
      [departmentId]
    );
    if (deptRows.rows.length === 0) throw new Error("Department lookup failed for student");
    tableName = `user_student_${deptRows.rows[0].department_name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  } else {
    throw Object.assign(new Error("Unauthorized role for status change"), { statusCode: 403 });
  }

  // Transaction: update both credentials and the student's dept table
  const client = await authPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE credentials.table_login SET status = $1, last_updated_by = $2 WHERE user_name = $3",
      [targetStatus, callerUser.username, String(roll_no).toLowerCase()]
    );
    await client.query(
      `UPDATE event_management.${tableName} SET status = $1, last_updated_by = $2 WHERE roll_no = $3`,
      [targetStatus, callerUser.username, roll_no]
    );
    await client.query("COMMIT");
  } catch (txErr) {
    await client.query("ROLLBACK");
    throw txErr;
  } finally {
    client.release();
  }

  return { success: true, message: `Student status successfully updated to ${targetStatus}` };
}

module.exports = {
  generateRandomPassword,
  validateRange,
  validateBatchService,
  createOneStudentGeneric,
  createUsersService,
  createStudentsRangeService,
  createStudentSingleService,
  createStudentsExcelService,
  updateStudentService,
  promoteYearForBatchService,
  getAdvisorStudentsService,
  updateStudentStatusService,
};
