const XLSX = require("xlsx");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { authPool, eventPool, callProcedure } = require("../config/db");

// Cryptographically secure random password generator (BUG 3)
function generateRandomPassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const len = 12;
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
  const outRow = rows[0];
  const isValid = outRow?.p_is_valid === true;

  return {
    success:     true,
    valid:       isValid,
    currentYear: isValid ? Number(outRow.p_current_year) : null,
    message:     outRow?.p_message || "",
  };
}

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
  batch
}) {
  const spName = isAdmin ? "sp_create_student_user_admin" : "sp_create_student_user";
  const spParams = isAdmin
    ? [
        rollNo,
        rollNo.toLowerCase(),
        firstName || "",
        lastName || "",
        gender || "",
        registrationNo || "",
        academicYearId || null,
        currentYear,
        course || "",
        semester || null,
        batch,
        departmentId,
        creatorUsername
      ]
    : [
        creatorUsername,
        rollNo,
        rollNo.toLowerCase(),
        firstName || "",
        lastName || "",
        gender || "",
        registrationNo || "",
        academicYearId || null,
        currentYear,
        course || "",
        semester || null,
        batch,
        creatorUsername
      ];

  const spRows = await callProcedure(eventPool, spName, spParams);
  const outRow = spRows[0];
  if (!outRow || !outRow.p_success) {
    throw new Error(outRow?.p_message || `${spName} failed`);
  }
  return outRow;
}

// ── Admin/Staff create student batch (Range) ──────────────────────────────────
async function createUsersService(req, payload) {
  const caller = req.user;
  const isAdmin = caller.role === "ADMIN";
  const { prefix, userType, rangeFrom, rangeTo, course, semester, batch, department } = payload;

  if (!prefix)   throw new Error("prefix is required");
  if (!userType) throw new Error("userType is required");
  if (!course)   throw new Error("course is required");
  if (!batch)    throw new Error("batch is required");
  if (userType !== "Range")
    throw new Error("Only 'Range' userType is currently supported");

  const { from, to } = validateRange(rangeFrom, rangeTo);

  let departmentId, departmentName, currentYear, academicYearId;

  if (isAdmin) {
    if (!department) throw new Error("department is required");
    const deptRows = await callProcedure(eventPool, "sp_get_department_id_by_name", [department]);
    if (!deptRows || deptRows.length === 0) throw new Error("Department not found");
    departmentId = deptRows[0].department_id;
    departmentName = deptRows[0].department_name;

    const valResult = await validateBatchService(batch, course);
    if (!valResult.valid) throw new Error(valResult.message || "Invalid batch");
    currentYear = valResult.currentYear;

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
    if (!ayRows || ayRows.length === 0)
      throw new Error(`Academic year not found for batch="${batch}". Ensure AY${batch} exists in academic_year table.`);
    academicYearId = ayRows[0].academic_year_id;
  } else {
    // Advisor flow
    const ctxRows = await callProcedure(eventPool, "sp_get_advisor_context", [caller.username]);
    if (!ctxRows || ctxRows.length === 0)
      throw new Error("Advisor context not found — ensure your account is registered in user_faculty");

    const ctx            = ctxRows[0];
    departmentId   = ctx.department_id;
    departmentName = ctx.department_name;
    const advisorBatch   = ctx.batch;
    currentYear    = ctx.current_year;

    if (String(advisorBatch) !== String(batch))
      throw new Error(`Batch mismatch: your assigned batch is "${advisorBatch}", cannot create students for batch "${batch}"`);

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
    if (!ayRows || ayRows.length === 0)
      throw new Error(`Academic year not found for batch="${batch}". Ensure AY${batch} exists in academic_year table.`);
    academicYearId = ayRows[0].academic_year_id;
  }

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
        username, hashedPwd, "R01", departmentId, "ACTIVE", caller.username,
      ]);
      const wasInserted = result && result[0] ? Number(result[0].inserted) : 1;
      if (wasInserted) {
        insertedInAuth.push(username);
        createdUsers.push({ username, password: rawPassword });
        
        // Set must_change_password
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
        creatorUsername: caller.username,
        isAdmin,
        departmentId,
        rollNo: username,
        firstName: "",
        lastName: "",
        gender: "",
        registrationNo: "",
        academicYearId,
        currentYear,
        course,
        semester: semester || null,
        batch
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

// ── Staff-flow create student range ──────────────────────────────────────────
async function createStudentsRangeService(req, payload) {
  const caller = req.user;
  const isAdmin = caller.role === "ADMIN";
  const { prefix, rangeFrom, rangeTo, course, semester, department, batch: batchInput } = payload;

  const start = parseInt(rangeFrom, 10);
  const end = parseInt(rangeTo, 10);

  if (isNaN(start) || isNaN(end) || start > end) {
    throw new Error("Invalid range parameters");
  }
  if (end - start > 500) {
    throw new Error("Range size exceeds 500 limit");
  }

  let departmentId, departmentName, currentYear, academicYearId, batch;

  if (isAdmin) {
    if (!department) throw new Error("department is required");
    if (!batchInput) throw new Error("batch is required");
    batch = batchInput;

    const deptRows = await callProcedure(eventPool, "sp_get_department_id_by_name", [department]);
    if (!deptRows || deptRows.length === 0) throw new Error("Department not found");
    departmentId = deptRows[0].department_id;
    departmentName = deptRows[0].department_name;

    const valResult = await validateBatchService(batch, course);
    if (!valResult.valid) throw new Error(valResult.message || "Invalid batch");
    currentYear = valResult.currentYear;

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
    if (!ayRows || ayRows.length === 0) throw new Error(`Academic year not found for batch "${batch}"`);
    academicYearId = ayRows[0].academic_year_id;
  } else {
    // Advisor flow
    const advCtx = await callProcedure(eventPool, "sp_get_advisor_context", [caller.username]);
    if (!advCtx || advCtx.length === 0) {
      throw new Error("Advisor context not found");
    }
    const ctx = advCtx[0];
    departmentId = ctx.department_id;
    departmentName = ctx.department_name;
    batch = ctx.batch;
    currentYear = ctx.current_year;

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
    if (!ayRows || ayRows.length === 0) throw new Error(`Academic year not found for batch "${batch}"`);
    academicYearId = ayRows[0].academic_year_id;
  }

  let createdCount = 0;
  let failedCount = 0;
  const succeeded = [];
  const errors = [];

  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);

  for (let i = start; i <= end; i++) {
    const rollNoStr = String(i).padStart(2, "0");
    const roll_no = prefix + rollNoStr;
    const username = roll_no.toLowerCase();

    try {
      const outRow = await createOneStudentGeneric({
        creatorUsername: caller.username,
        isAdmin,
        departmentId,
        rollNo: roll_no,
        firstName: "",
        lastName: "",
        gender: "",
        registrationNo: "",
        academicYearId,
        currentYear,
        course,
        semester,
        batch
      });

      const rawPassword = generateRandomPassword();
      const hashed = await bcrypt.hash(rawPassword, saltRounds);

      try {
        await callProcedure(authPool, "sp_insert_login", [username, hashed, "R01", departmentId, "ACTIVE", caller.username]);
        
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

// ── Staff-flow create student single ─────────────────────────────────────────
async function createStudentSingleService(req, payload) {
  const caller = req.user;
  const isAdmin = caller.role === "ADMIN";
  const { roll_no, first_name, last_name, gender, registration_no, course, semester, department, batch: batchInput } = payload;

  let departmentId, departmentName, currentYear, academicYearId, batch;

  if (isAdmin) {
    if (!department) throw new Error("department is required");
    if (!batchInput) throw new Error("batch is required");
    batch = batchInput;

    const deptRows = await callProcedure(eventPool, "sp_get_department_id_by_name", [department]);
    if (!deptRows || deptRows.length === 0) throw new Error("Department not found");
    departmentId = deptRows[0].department_id;
    departmentName = deptRows[0].department_name;

    const valResult = await validateBatchService(batch, course);
    if (!valResult.valid) throw new Error(valResult.message || "Invalid batch");
    currentYear = valResult.currentYear;

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
    if (!ayRows || ayRows.length === 0) throw new Error(`Academic year not found for batch "${batch}"`);
    academicYearId = ayRows[0].academic_year_id;
  } else {
    // Advisor flow
    const advCtx = await callProcedure(eventPool, "sp_get_advisor_context", [caller.username]);
    if (!advCtx || advCtx.length === 0) {
      throw new Error("Advisor context not found");
    }
    const ctx = advCtx[0];
    departmentId = ctx.department_id;
    departmentName = ctx.department_name;
    batch = ctx.batch;
    currentYear = ctx.current_year;

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
    if (!ayRows || ayRows.length === 0) throw new Error(`Academic year not found for batch "${batch}"`);
    academicYearId = ayRows[0].academic_year_id;
  }

  const username = String(roll_no).trim().toLowerCase();
  const rawPassword = generateRandomPassword();
  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
  const hashed = await bcrypt.hash(rawPassword, saltRounds);

  const outRow = await createOneStudentGeneric({
    creatorUsername: caller.username,
    isAdmin,
    departmentId,
    rollNo: String(roll_no).trim(),
    firstName: first_name ? String(first_name).trim() : "",
    lastName: last_name ? String(last_name).trim() : "",
    gender: gender ? String(gender).trim() : "",
    registrationNo: registration_no ? String(registration_no).trim() : "",
    academicYearId,
    currentYear,
    course: course ? String(course).trim() : "",
    semester: semester ? parseInt(semester, 10) : 1,
    batch
  });

  try {
    await callProcedure(authPool, "sp_insert_login", [username, hashed, "R01", departmentId, "ACTIVE", caller.username]);

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

// ── Staff-flow bulk create student Excel ──────────────────────────────────────
async function createStudentsExcelService(req, rows) {
  const caller = req.user;
  const isAdmin = caller.role === "ADMIN";

  let departmentId, departmentName, currentYear, academicYearId, batch, derived_semester;

  if (isAdmin) {
    const { department, batch: batchInput, course, semester } = req.body;
    if (!department) throw new Error("department is required");
    if (!batchInput) throw new Error("batch is required");
    batch = batchInput;
    derived_semester = semester ? parseInt(semester, 10) : 1;

    const deptRows = await callProcedure(eventPool, "sp_get_department_id_by_name", [department]);
    if (!deptRows || deptRows.length === 0) throw new Error("Department not found");
    departmentId = deptRows[0].department_id;
    departmentName = deptRows[0].department_name;

    const valResult = await validateBatchService(batch, course || "B.E");
    if (!valResult.valid) throw new Error(valResult.message || "Invalid batch");
    currentYear = valResult.currentYear;

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
    if (!ayRows || ayRows.length === 0) throw new Error(`Academic year not found for batch "${batch}"`);
    academicYearId = ayRows[0].academic_year_id;
  } else {
    // Advisor flow
    const advCtx = await callProcedure(eventPool, "sp_get_advisor_context", [caller.username]);
    if (!advCtx || advCtx.length === 0) {
      throw new Error("Advisor context not found");
    }
    const ctx = advCtx[0];
    departmentId = ctx.department_id;
    departmentName = ctx.department_name;
    batch = ctx.batch;
    currentYear = ctx.current_year;
    derived_semester = ctx.derived_semester;

    const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
    if (!ayRows || ayRows.length === 0) throw new Error(`Academic year not found for batch "${batch}"`);
    academicYearId = ayRows[0].academic_year_id;
  }

  let createdCount = 0;
  let failedCount = 0;
  const succeeded = [];
  const errors = [];

  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);

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

    try {
      const activeCourse = course ? String(course).trim() : (req.body.course || "B.E");
      const outRow = await createOneStudentGeneric({
        creatorUsername: caller.username,
        isAdmin,
        departmentId,
        rollNo: rollNoStr,
        firstName: first_name ? String(first_name).trim() : "",
        lastName: last_name ? String(last_name).trim() : "",
        gender: gender ? String(gender).trim() : "",
        registrationNo: registration_no ? String(registration_no).trim() : "",
        academicYearId,
        currentYear,
        course: activeCourse,
        semester: derived_semester,
        batch
      });

      const rawPassword = generateRandomPassword();
      const hashed = await bcrypt.hash(rawPassword, saltRounds);

      try {
        await callProcedure(authPool, "sp_insert_login", [username, hashed, "R01", departmentId, "ACTIVE", caller.username]);

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

// ── Update student details ──────────────────────────────────────────────────
async function updateStudentService(req, roll_no, payload) {
  const caller = req.user;
  const isAdmin = caller.role === "ADMIN";
  const { first_name, last_name, gender, registration_no, course, newPassword } = payload;

  if (isAdmin) {
    // Admin: look up which dept table holds this student, then update directly
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
        first_name ? String(first_name).trim() : "",
        last_name ? String(last_name).trim() : "",
        gender ? String(gender).trim() : "",
        registration_no ? String(registration_no).trim() : "",
        course ? String(course).trim() : "",
        caller.username,
        roll_no
      ]
    );
  } else {
    // Advisor: use stored procedure (validates batch/dept ownership)
    const rows = await callProcedure(eventPool, "sp_update_student", [
      caller.username,
      roll_no,
      first_name ? String(first_name).trim() : "",
      last_name ? String(last_name).trim() : "",
      gender ? String(gender).trim() : "",
      registration_no ? String(registration_no).trim() : "",
      course ? String(course).trim() : "",
    ]);
    const outRow = rows[0];
    if (!outRow || !outRow.p_success) {
      throw new Error(outRow?.p_message || "sp_update_student failed");
    }
  }

  if (newPassword && String(newPassword).trim().length >= 6) {
    const studentUsername = String(roll_no).trim().toLowerCase();
    const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);
    const newHash = await bcrypt.hash(String(newPassword).trim(), saltRounds);

    await authPool.query(
      `UPDATE credentials.table_login SET password = $1, last_updated_by = $2, must_change_password = false WHERE user_name = $3`,
      [newHash, caller.username, studentUsername]
    );
  }

  return { success: true, message: "Student updated successfully" };
}


// ── Admin-flow promote batch ────────────────────────────────────────────────
async function promoteYearForBatchService(req, payload) {
  const { batch, department } = payload;
  const rows = await callProcedure(eventPool, "sp_promote_year_for_batch", [batch, department]);
  const outRow = rows[0];

  if (!outRow || !outRow.p_success) {
    throw new Error(outRow?.p_message || "sp_promote_year_for_batch failed");
  }

  return { success: true, message: outRow.p_message, affectedRows: outRow.p_affected_count };
}

// ── Advisor-flow get advisor's student list ──────────────────────────────────
async function getAdvisorStudentsService(req) {
  const { username } = req.user;

  const advCtx = await callProcedure(eventPool, "sp_get_advisor_context", [username]);
  const deptName = advCtx && advCtx[0] ? advCtx[0].department_name : "Unknown";

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
}

// ── CONTROLLERS ──────────────────────────────────────────────────────────────

exports.createStudents = async (req, res) => {
  try {
    const { prefix, userType, rangeFrom, rangeTo, course, semester, batch } = req.body;
    const result = await createUsersService(req, {
      prefix, userType, rangeFrom, rangeTo, course, semester, batch
    });
    return res.json(result);
  } catch (err) {
    console.error("createStudents error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAdvisorStudents = async (req, res) => {
  try {
    const result = await getAdvisorStudentsService(req);
    return res.json(result);
  } catch (err) {
    console.error("❌ getAdvisorStudents error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStudentsRange = async (req, res) => {
  try {
    const { prefix, range_from, range_to, course, semester } = req.body;
    if (!prefix || range_from === undefined || range_to === undefined) {
      return res.status(400).json({ success: false, message: "Missing prefix or range limits" });
    }
    const result = await createStudentsRangeService(req, {
      prefix,
      rangeFrom: range_from,
      rangeTo: range_to,
      course,
      semester,
    });
    return res.json(result);
  } catch (err) {
    console.error("❌ createStudentsRange error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStudentSingle = async (req, res) => {
  try {
    const { roll_no, first_name, last_name, gender, registration_no, course, semester } = req.body;
    if (!roll_no) {
      return res.status(400).json({ success: false, message: "Roll number is required" });
    }
    const result = await createStudentSingleService(req, {
      roll_no, first_name, last_name, gender, registration_no, course, semester
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

    const result = await createStudentsExcelService(req, rows);
    return res.json(result);
  } catch (err) {
    console.error("❌ createStudentsExcel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

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
    const result = await updateStudentService(req, roll_no, {
      first_name, last_name, gender, registration_no, course, newPassword
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
    const result = await promoteYearForBatchService(req, { batch, department });
    return res.json(result);
  } catch (err) {
    console.error("❌ promoteBatch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateStudentStatus = async (req, res) => {
  try {
    const caller = req.user;
    const { roll_no } = req.params;
    const { status } = req.body;

    if (!roll_no || !status) {
      return res.status(400).json({ success: false, message: "Roll number and status are required" });
    }

    const targetStatus = String(status).toUpperCase();
    if (targetStatus !== "ACTIVE" && targetStatus !== "INACTIVE") {
      return res.status(400).json({ success: false, message: "Invalid status value. Must be ACTIVE or INACTIVE" });
    }

    const { rows } = await authPool.query(
      "SELECT user_name, department_id FROM credentials.table_login WHERE user_name = $1 AND user_role_id = 'R01'",
      [String(roll_no).toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Student credentials not found" });
    }

    const departmentId = rows[0].department_id;
    let tableName;

    if (caller.role === "ADVISOR") {
      const advCtxRows = await callProcedure(eventPool, "sp_get_advisor_context", [caller.username]);
      const advCtx = advCtxRows[0];
      if (!advCtx || advCtx.department_id !== departmentId) {
        return res.status(403).json({ success: false, message: "Unauthorized: student is in a different department" });
      }

      tableName = `user_student_${advCtx.department_name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      const studentCheck = await eventPool.query(
        `SELECT 1 FROM event_management.${tableName} WHERE roll_no = $1 AND batch = $2`,
        [roll_no, advCtx.batch]
      );
      if (studentCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: "Unauthorized: student is not in your assigned batch" });
      }
    } else if (caller.role === "ADMIN") {
      const deptRows = await eventPool.query(
        "SELECT department_name FROM event_management.department WHERE department_id = $1",
        [departmentId]
      );
      if (deptRows.rows.length === 0) {
        return res.status(500).json({ success: false, message: "Department lookup failed for student" });
      }
      tableName = `user_student_${deptRows.rows[0].department_name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    } else {
      return res.status(403).json({ success: false, message: "Unauthorized role for status change" });
    }

    const client = await authPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE credentials.table_login SET status = $1, last_updated_by = $2 WHERE user_name = $3",
        [targetStatus, caller.username, String(roll_no).toLowerCase()]
      );
      await client.query(
        `UPDATE event_management.${tableName} SET status = $1, last_updated_by = $2 WHERE roll_no = $3`,
        [targetStatus, caller.username, roll_no]
      );
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    return res.json({ success: true, message: `Student status successfully updated to ${targetStatus}` });
  } catch (err) {
    console.error("❌ updateStudentStatus error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

