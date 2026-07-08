// backend/src/services/admin.service.js
// ALL database logic lives in MySQL stored procedures.
// This file ONLY calls procedures — zero raw SQL, zero hardcoded values.

const bcrypt = require("bcrypt");
const { authPool, eventPool, callProcedure } = require("../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function validateRange(rangeFrom, rangeTo) {
  const from = parseInt(rangeFrom, 10);
  const to   = parseInt(rangeTo,   10);
  if (isNaN(from) || isNaN(to) || from < 1 || to < 1 || from > to)
    throw new Error("Invalid range: rangeFrom and rangeTo must be positive integers, rangeFrom ≤ rangeTo");
  if (to - from + 1 > 500)
    throw new Error("Range too large: maximum 500 users per batch");
  return { from, to };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET DEPARTMENTS SERVICE
// ─────────────────────────────────────────────────────────────────────────────
// Returns all departments from DB — used by frontend dropdowns.
// No hardcoded department lists anywhere in the application.
exports.getDepartmentsService = async () => {
  const rows = await callProcedure(eventPool, "sp_get_departments", []);
  return { success: true, data: rows || [] };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET STAFF ROLES SERVICE
// ─────────────────────────────────────────────────────────────────────────────
// Returns staff-eligible roles (excludes STUDENT) from user_role table.
exports.getStaffRolesService = async () => {
  const rows = await callProcedure(eventPool, "sp_get_staff_roles", []);
  return { success: true, data: rows || [] };
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATE BATCH SERVICE
// ─────────────────────────────────────────────────────────────────────────────
// Calls sp_validate_batch_and_year to verify batch year and derive current_year.
// All validation logic lives exclusively in the stored procedure.
// p_current_calendar_year is injected by the server — never trusted from client.
exports.validateBatchService = async (batch, course) => {
  const currentCalendarYear = new Date().getFullYear();

  await eventPool.query(
    `CALL sp_validate_batch_and_year(?, ?, ?, @p_is_valid, @p_current_year, @p_message)`,
    [parseInt(batch, 10), String(course).trim(), currentCalendarYear]
  );

  const [[outRow]] = await eventPool.query(
    `SELECT @p_is_valid AS is_valid, @p_current_year AS current_year, @p_message AS message`
  );

  const isValid = Number(outRow?.is_valid) === 1;

  return {
    success:     true,
    valid:       isValid,
    currentYear: isValid ? Number(outRow.current_year) : null,
    message:     outRow?.message || "",
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE STAFF SERVICE  (ADMIN → ADVISOR / HOD / PRINCIPAL …)
// ─────────────────────────────────────────────────────────────────────────────
//
// SPs used:
//   sp_create_staff_user   (event_management)
//     Validates dept + role, auto-generates FAC### id, inserts user_faculty row.
//     OUT: p_success, p_message, p_faculty_id, p_role_id
//
//   sp_insert_login        (credentials)
//     Inserts the login credential row.
//
//   sp_rollback_login      (credentials)
//     Deletes the login row if the event_management insert failed.
//
exports.createStaffService = async (req, payload) => {
  const admin = req.user;

  const {
    department,
    staffRole,
    firstName,
    lastName,
    batch,
    password,
    gender,
    course,
    currentYear,
  } = payload;

  // ── Basic validation ──────────────────────────────────────────────────────
  if (!firstName)   throw new Error("firstName is required");
  if (!staffRole)   throw new Error("staffRole is required");

  // Validate batch is numeric if provided (for ADVISOR roles)
  if (batch && batch !== "N/A") {
    if (!/^\d{4}$/.test(String(batch).trim())) {
      throw new Error(`batch must be a 4-digit year, got: "${batch}"`);
    }
  }

  // Validate course is string type (B.E or M.E)
  if (course && !["B.E", "M.E", "-", ""].includes(String(course).trim())) {
    throw new Error(`course must be "B.E" or "M.E", got: "${course}"`);
  }

  // Resolve department_id from the department name provided by admin
  let departmentId = null;
  if (department) {
    const deptRows = await callProcedure(eventPool, "sp_get_department_id_by_name", [department]);
    if (!deptRows || deptRows.length === 0)
      throw new Error(`Department not found: "${department}"`);
    departmentId = deptRows[0].department_id;
  }

  // ── Pre-generate unique username from firstName + lastName ────────────────
  //   The live sp_create_staff_user requires username as its first IN param.
  //   We mirror the same logic as sp_bulk_create_staff (which auto-generates).
  const baseUsername = (firstName + (lastName || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (!baseUsername) throw new Error("Cannot generate username from empty first_name / last_name");

  let generatedUsername = baseUsername;
  let suffix = 0;
  // Ensure uniqueness in user_faculty
  while (true) {
    const [[{ cnt }]] = await eventPool.query(
      "SELECT COUNT(*) AS cnt FROM user_faculty WHERE user_name = ?",
      [generatedUsername]
    );
    if (Number(cnt) === 0) break;
    suffix += 1;
    generatedUsername = `${baseUsername}${suffix}`;
  }

  // ── Log payload for debugging ─────────────────────────────────────────────
  const sanitizedPayload = {
    generatedUsername,
    firstName,
    lastName: lastName || "",
    gender: gender || "",
    staffRole,
    department,
    departmentId,
    batch: batch || "N/A",
    course: course || "-",
    // DO NOT LOG PASSWORD
  };
  console.log("🔍 createStaffService payload validation:", JSON.stringify(sanitizedPayload, null, 2));

  // ── Step 1: Create staff in Event_Management via sp_create_staff_user ─────
  //   Live DB SP parameter order:
  //   p_username, p_first_name, p_last_name, p_gender, p_role_name,
  //   p_department_id, p_batch, p_current_year, p_course, p_created_by
  //   OUT: p_success, p_message, p_faculty_id, p_role_id  (NO p_username OUT)

  const [spResult] = await eventPool.query(
    `CALL sp_create_staff_user(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @p_success, @p_message, @p_faculty_id, @p_role_id)`,
    [
      generatedUsername,
      firstName,
      lastName     || "",
      gender       || "",
      staffRole,
      departmentId,
      batch        || "N/A",
      currentYear  != null ? parseInt(currentYear, 10) : 0,
      course       || "-",
      admin.username,
    ]
  );

  // Fetch OUT param values
  const [[outRow]] = await eventPool.query(
    `SELECT @p_success AS success, @p_message AS message, @p_faculty_id AS faculty_id, @p_role_id AS role_id`
  );

  if (!outRow || !Number(outRow.success)) {
    throw new Error(outRow?.message || "sp_create_staff_user failed without a message");
  }

  const facultyId = outRow.faculty_id;
  const roleId    = outRow.role_id;

  // ── Step 2: Hash password ─────────────────────────────────────────────────
  const saltRounds  = parseInt(process.env.BCRYPT_SALT || "10", 10);
  const rawPassword = String(password || "").trim() || `${generatedUsername}7311`;
  const hashedPwd   = await bcrypt.hash(rawPassword, saltRounds);

  // ── Step 3: Insert login credentials ─────────────────────────────────────
  try {
    const result = await callProcedure(
      authPool,
      "sp_insert_login",
      [generatedUsername, hashedPwd, roleId, departmentId, "ACTIVE", admin.username]
    );
    const wasInserted = result && result[0] ? Number(result[0].inserted) : 1;
    if (!wasInserted)
      throw new Error(`Username already exists in credentials: "${generatedUsername}"`);
  } catch (err) {
    // Rollback user_faculty insert since credentials failed
    console.error("❌ Credentials insert failed — rolling back user_faculty:", err.message);
    try {
      await eventPool.query(
        "DELETE FROM user_faculty WHERE user_name = ? AND faculty_id = ?",
        [generatedUsername, facultyId]
      );
    } catch (rbErr) {
      console.error("❌ user_faculty rollback FAILED:", rbErr.message);
    }
    throw new Error(`Credentials DB insert failed: ${err.message}`);
  }

  console.log(`✅ Staff created: ${generatedUsername} (${facultyId}, role=${staffRole})`);

  return {
    success:     true,
    message:     `Staff "${generatedUsername}" created successfully (${facultyId})`,
    facultyId,
    username:    generatedUsername,
    role:        staffRole,
    department,
    batch:       batch || "N/A",
    currentYear: currentYear != null ? parseInt(currentYear, 10) : 0,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE USERS SERVICE  (ADVISOR → STUDENTS)
// ─────────────────────────────────────────────────────────────────────────────
//
// SPs used:
//   sp_get_advisor_context(p_advisor_username)   (event_management)
//     Returns: department_id, department_name, batch, current_year, study_year
//
//   sp_get_academic_year_by_batch(p_batch)        (event_management)
//     Returns: academic_year_id
//
//   sp_ensure_student_table(p_dept_name)          (event_management)
//     Creates user_student_{dept} if not exists. Returns: table_name
//
//   sp_insert_login(...)                          (credentials)
//     Inserts login credential row.
//
//   sp_create_student_user(p_advisor_username, …) (event_management)
//     Validates advisor dept+batch restriction, then inserts student row.
//
//   sp_rollback_logins(p_usernames TEXT)          (credentials)
//     Deletes login rows on rollback.
//
exports.createUsersService = async (req, payload) => {
  const advisor = req.user;

  const { prefix, userType, rangeFrom, rangeTo, course, semester, batch } = payload;

  if (!prefix)   throw new Error("prefix is required");
  if (!userType) throw new Error("userType is required");
  if (!course)   throw new Error("course is required");
  if (!batch)    throw new Error("batch is required");
  if (userType !== "Range")
    throw new Error("Only 'Range' userType is currently supported");

  const { from, to } = validateRange(rangeFrom, rangeTo);

  // ── Step 1: Load advisor's context from DB (not from JWT) ─────────────────
  //   dept+batch are authoritative from user_faculty, not the JWT payload.
  const ctxRows = await callProcedure(eventPool, "sp_get_advisor_context", [advisor.username]);
  if (!ctxRows || ctxRows.length === 0)
    throw new Error("Advisor context not found — ensure your account is registered in user_faculty");

  const ctx           = ctxRows[0];
  const departmentId  = ctx.department_id;
  const departmentName= ctx.department_name;
  const advisorBatch  = ctx.batch;
  const currentYear   = ctx.current_year;

  // Enforce: advisor can only create students for their own batch
  if (String(advisorBatch) !== String(batch))
    throw new Error(`Batch mismatch: your assigned batch is "${advisorBatch}", cannot create students for batch "${batch}"`);

  console.log(`✅ Advisor context: dept=${departmentName} (${departmentId}), batch=${advisorBatch}, year=${currentYear}`);

  // ── Step 2: Resolve academic_year_id ─────────────────────────────────────
  const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
  if (!ayRows || ayRows.length === 0)
    throw new Error(`Academic year not found for batch="${batch}". Ensure AY${batch} exists in academic_year table.`);
  const academicYearId = ayRows[0].academic_year_id;

  // ── Step 3: Ensure student table exists (DDL — auto-commits) ─────────────
  const tableRows = await callProcedure(eventPool, "sp_ensure_student_table", [departmentName]);
  if (!tableRows || tableRows.length === 0)
    throw new Error("sp_ensure_student_table did not return table_name");
  const tableName = tableRows[0].table_name;
  console.log(`✅ Student table ready: ${tableName}`);

  // ── Step 4: Insert each student ───────────────────────────────────────────
  const saltRounds     = parseInt(process.env.BCRYPT_SALT || "10", 10);
  const insertedInAuth = [];

  for (let i = from; i <= to; i++) {
    const paddedNum  = String(i).padStart(2, "0");
    const username   = `${prefix}${paddedNum}`;
    const rawPassword= `${prefix}${paddedNum}@2024`;
    const hashedPwd  = await bcrypt.hash(rawPassword, saltRounds);

    // 4a — Credentials DB
    try {
      const result = await callProcedure(authPool, "sp_insert_login", [
        username, hashedPwd, "R01", departmentId, "ACTIVE", advisor.username,
      ]);
      const wasInserted = result && result[0] ? Number(result[0].inserted) : 1;
      if (wasInserted) {
        insertedInAuth.push(username);
      } else {
        console.warn(`  ⚠ auth duplicate skipped: ${username}`);
      }
    } catch (err) {
      throw new Error(`Credentials insert failed at ${username}: ${err.message}`);
    }

    // 4b — Event_Management (sp_create_student_user enforces advisor dept+batch)
    try {
      await callProcedure(eventPool, "sp_create_student_user", [
        advisor.username,   // advisor validated inside SP
        username,           // roll_no
        username,           // user_name
        academicYearId,
        departmentId,
        currentYear,
        course,
        semester || null,
        batch,
        advisor.username,
      ]);
    } catch (err) {
      // Distributed rollback: remove auth rows inserted so far
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

  console.log(`✅ createUsersService complete — ${insertedInAuth.length} students created`);
  return {
    success:      true,
    message:      `Successfully created ${insertedInAuth.length} students in ${tableName}`,
    createdUsers: insertedInAuth,
    totalCreated: insertedInAuth.length,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE STAFF SERVICE  (ADMIN → edit existing staff user)
// ─────────────────────────────────────────────────────────────────────────────
//
// SPs used:
//   sp_get_department_id_by_name(p_dept_name)   — resolves dept name → id
//   sp_update_staff_user(facultyId, …, OUT success, message)
//
exports.updateStaffService = async (req, payload) => {
  const admin = req.user;

  const { facultyId, firstName, lastName, department, batch, currentYear, role } = payload;

  if (!facultyId) throw new Error("facultyId is required");

  // Resolve department_id from name if department string provided
  let departmentId = null;
  if (department && String(department).trim()) {
    const deptRows = await callProcedure(eventPool, "sp_get_department_id_by_name", [department.trim()]);
    if (!deptRows || deptRows.length === 0)
      throw new Error(`Department not found: "${department}"`);
    departmentId = deptRows[0].department_id;
  }

  // Resolve role_id from name if role string provided
  let roleId = null;
  if (role && String(role).trim()) {
    const roleRows = await callProcedure(eventPool, "sp_get_role_id_by_name", [role.trim()]);
    if (!roleRows || roleRows.length === 0)
      throw new Error(`Role not found: "${role}"`);
    roleId = roleRows[0].user_role_id;
  }

  await eventPool.query(
    `CALL sp_update_staff_user(?, ?, ?, ?, ?, ?, ?, ?, @p_success, @p_message)`,
    [
      facultyId,
      firstName  ? firstName.trim()  : null,
      lastName   ? lastName.trim()   : null,
      departmentId,
      batch      ? batch.trim()      : null,
      currentYear != null ? parseInt(currentYear, 10) : null,
      roleId,  // VARCHAR e.g. "R03"
      admin.username,
    ]
  );

  const [[outRow]] = await eventPool.query(
    `SELECT @p_success AS success, @p_message AS message`
  );

  if (!outRow || !Number(outRow.success)) {
    throw new Error(outRow?.message || "sp_update_staff_user failed");
  }

  console.log(`✅ Staff updated: ${facultyId} by ${admin.username}`);
  return { success: true, message: outRow.message };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET USERS SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.getUsersService = async (req) => {
  const user = req?.user;
  const eventUsers = await callProcedure(eventPool, "sp_get_all_users", []);
  if (!eventUsers || eventUsers.length === 0)
    return { success: true, data: [], total: 0 };

  const credRows = await callProcedure(authPool, "sp_get_all_credentials", []);
  const credMap  = {};
  (credRows || []).forEach((c) => {
    credMap[c.user_name] = { status: c.status, userRole: c.user_role_name || "Unknown" };
  });

  let finalData = eventUsers.map((u) => {
    const cred = credMap[u.user_name] || {};
    return {
      userId:          u.roll_no || u.faculty_id,
      fullName:        u.full_name
                         ? u.full_name.trim() || u.user_name
                         : `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.user_name,
      faculty_id:      u.faculty_id || null,
      userName:        `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.user_name,
      course:          u.course || null,
      department:      u.department_name || "Unknown",
      department_name: u.department_name || "Unknown",
      year:            u.current_year    || null,
      batch:           u.batch           || null,
      batchYear:       u.batch           || null,
      semester:        u.semester        || null,
      registrationNo:  u.registration_no || null,
      registration_no: u.registration_no || null,
      status:          String(cred.status || "INACTIVE").toUpperCase(),
      userRole:        cred.userRole || u.base_role || "Unknown",
      createdAt:       u.created_on || null,
      timestamp:       u.created_on || null,
      createdBy:       u.last_updated_by || null,   // audit: who created/last updated
      first_name:      u.first_name || "",
      last_name:       u.last_name  || "",
      user_name:       u.user_name,
      roll_no:         u.roll_no    || null,
      current_year:    u.current_year || null,
    };
  });

  if (user && user.role === 'ADVISOR') {
    const ctxRows = await callProcedure(eventPool, "sp_get_advisor_context", [user.username]);
    if (ctxRows && ctxRows.length > 0) {
      const ctx = ctxRows[0];
      finalData = finalData.filter(u => {
        return String(u.userRole).toUpperCase() === 'STUDENT' && 
               String(u.department_name) === String(ctx.department_name) && 
               String(u.batch) === String(ctx.batch);
      });
    } else {
      finalData = [];
    }
  }

  finalData.sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt) : 0;
    const db = b.createdAt ? new Date(b.createdAt) : 0;
    return db - da;
  });

  return { success: true, data: finalData, total: finalData.length };
};

// ─────────────────────────────────────────────────────────────────────────────
// BULK CREATE STAFF SERVICE  (ADMIN → Excel upload)
// ─────────────────────────────────────────────────────────────────────────────
//
// Accepts a parsed array of row objects (already validated by controller).
// For each row:
//   1. Resolve department_id from name
//   2. Auto-generate unique username from first+last name
//   3. Call sp_bulk_create_staff (event_management) — OUT params
//   4. Call sp_insert_login      (credentials)       — bcrypt password
//   5. Roll back user_faculty row on credentials failure
//
exports.bulkCreateStaffService = async (req, rows) => {
  const admin      = req.user;
  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);

  // Pre-load all departments once to avoid N+1 lookups
  const allDepts = await callProcedure(eventPool, "sp_get_departments", []);
  const deptMap  = {};
  (allDepts || []).forEach((d) => {
    deptMap[String(d.department_name).toUpperCase()] = d.department_id;
  });

  // Pre-load all staff roles once
  const allRoles = await callProcedure(eventPool, "sp_get_staff_roles", []);
  const roleSet  = new Set((allRoles || []).map((r) => String(r.user_role).toUpperCase()));

  const results   = [];
  const succeeded = [];
  const failed    = [];

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 2; // 1-based + header row

    // ── Per-row validation ────────────────────────────────────────────────
    const firstName  = String(row.first_name  || "").trim();
    const lastName   = String(row.last_name   || "").trim();
    const gender     = String(row.gender      || "").trim();
    const department = String(row.department  || "").trim();
    const roleName   = String(row.role        || "").trim().toUpperCase();
    const course     = String(row.course      || "").trim() || "-";
    const batchRaw   = String(row.batch       || "").trim();

    const rowErrors = [];
    if (!firstName)  rowErrors.push("first_name is required");
    if (!gender)     rowErrors.push("gender is required");
    if (!department) rowErrors.push("department is required");
    if (!roleName)   rowErrors.push("role is required");

    const departmentId = deptMap[department.toUpperCase()];
    if (department && !departmentId) rowErrors.push(`Department not found: "${department}"`);

    if (roleName && !roleSet.has(roleName)) rowErrors.push(`Role not found: "${roleName}"`);

    // Validate batch is numeric for ADVISOR roles
    if (roleName === "ADVISOR" && batchRaw && !/^\d{4}$/.test(batchRaw)) {
      rowErrors.push(`batch must be a 4-digit year for ADVISOR, got: "${batchRaw}"`);
    }

    // Validate course is valid type
    if (course && !["B.E", "M.E", "-"].includes(course)) {
      rowErrors.push(`course must be "B.E" or "M.E", got: "${course}"`);
    }

    let batchVal = "N/A";
    if (roleName === "ADVISOR" && batchRaw && /^\d{4}$/.test(batchRaw)) {
      batchVal = batchRaw;
    }

    if (rowErrors.length > 0) {
      failed.push({ row: rowNum, data: row, errors: rowErrors });
      continue;
    }

    // ── Log row data before SP call ────────────────────────────────────────
    console.log(`📝 Row ${rowNum} validated: firstName="${firstName}", lastName="${lastName}", gender="${gender}", role="${roleName}", batch="${batchVal}", course="${course}"`);

    // ── Step 1: Insert into user_faculty via sp_bulk_create_staff ─────────
    //   SP auto-generates username from firstName + lastName
    //   PARAMETER ORDER: firstName, lastName, gender, roleName, departmentId, batch, course, currentYear, createdBy
    const currentYearRaw = String(row.current_year ?? row.currentYear ?? "").trim();
    const currentYearVal = /^\d+$/.test(currentYearRaw) ? parseInt(currentYearRaw, 10) : 0;

    let username  = null;
    let facultyId = null;
    let roleId    = null;
    try {
      await eventPool.query(
        `CALL sp_bulk_create_staff(?, ?, ?, ?, ?, ?, ?, ?, ?, @p_success, @p_message, @p_username, @p_faculty_id, @p_role_id)`,
        [
          firstName, lastName || "", gender,
          roleName, departmentId ?? null,
          batchVal, course, currentYearVal, admin.username,
        ]
      );

      const [[spOut]] = await eventPool.query(
        `SELECT @p_success AS success, @p_message AS message, @p_username AS username, @p_faculty_id AS faculty_id, @p_role_id AS role_id`
      );

      if (!spOut || !Number(spOut.success)) {
        failed.push({ row: rowNum, data: row, errors: [spOut?.message || "sp_bulk_create_staff failed"] });
        continue;
      }

      username  = spOut.username;
      facultyId = spOut.faculty_id;
      roleId    = spOut.role_id;
    } catch (err) {
      failed.push({ row: rowNum, data: row, errors: [err.message] });
      continue;
    }

    // ── Step 2: Hash password and insert credentials ───────────────────────
    const rawPassword = `${username}7311`;
    const hashedPwd   = await bcrypt.hash(rawPassword, saltRounds);

    try {
      await callProcedure(authPool, "sp_insert_login", [
        username, hashedPwd, roleId, departmentId ?? null, "ACTIVE", admin.username,
      ]);
    } catch (err) {
      // Rollback user_faculty row
      console.error(`❌ Credentials insert failed for row ${rowNum} (${username}), rolling back:`, err.message);
      try {
        await eventPool.query(
          "DELETE FROM user_faculty WHERE user_name = ? AND faculty_id = ?",
          [username, facultyId]
        );
      } catch (rbErr) {
        console.error(`❌ Rollback FAILED for ${username}:`, rbErr.message);
      }
      failed.push({ row: rowNum, data: row, errors: [`Credentials insert failed: ${err.message}`] });
      continue;
    }

    console.log(`✅ Bulk staff created: ${username} (${facultyId})`);
    succeeded.push({ row: rowNum, username, facultyId, fullName: `${firstName} ${lastName}`.trim() });
  }

  return {
    success:   true,
    total:     rows.length,
    created:   succeeded.length,
    failed:    failed.length,
    succeeded,
    errors:    failed,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ADMIN PROFILE SERVICE
// ─────────────────────────────────────────────────────────────────────────────
// Reads basic admin info from user_faculty (if exists) and table_login.
exports.getAdminProfileService = async (req) => {
  const { username, role, roleId } = req.user;

  // Fetch credentials row for email/status
  const [[credRow]] = await authPool.query(
    `SELECT user_name, user_role_id, department_id, status FROM table_login WHERE user_name = ? LIMIT 1`,
    [username]
  );

  // Fetch faculty profile row (if admin is also in user_faculty)
  const [[facRow]] = await eventPool.query(
    `SELECT uf.first_name, uf.last_name, uf.gender, uf.contact, uf.department_id,
            d.department_name, uf.user_profile
     FROM user_faculty uf
     LEFT JOIN department d ON uf.department_id = d.department_id
     WHERE uf.user_name = ? LIMIT 1`,
    [username]
  );

  return {
    success: true,
    data: {
      username,
      role,
      roleId: credRow?.user_role_id || roleId,
      status: credRow?.status || "ACTIVE",
      firstName:    facRow?.first_name    || "",
      lastName:     facRow?.last_name     || "",
      fullName:     facRow ? `${facRow.first_name || ""} ${facRow.last_name || ""}`.trim() : username,
      gender:       facRow?.gender        || "",
      phone:        facRow?.contact       || "",
      department:   facRow?.department_name || "",
      profilePicUrl: facRow?.user_profile || null,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE ADMIN PROFILE SERVICE
// ─────────────────────────────────────────────────────────────────────────────
// Supports updating phone/contact in user_faculty and password in table_login.
exports.updateAdminProfileService = async (req, payload) => {
  const { username } = req.user;
  const { phone, currentPassword, newPassword } = payload;

  // Update phone in user_faculty (if the admin has a faculty row)
  if (phone !== undefined) {
    await eventPool.query(
      `UPDATE user_faculty SET contact = ?, last_updated_by = ? WHERE user_name = ?`,
      [String(phone).trim(), username, username]
    );
  }

  // Change password flow
  if (newPassword) {
    if (!currentPassword) throw new Error("Current password is required to set a new password");

    // Fetch current hash
    const [[credRow]] = await authPool.query(
      `SELECT password FROM table_login WHERE user_name = ? LIMIT 1`,
      [username]
    );
    if (!credRow) throw new Error("Admin credentials not found");

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

