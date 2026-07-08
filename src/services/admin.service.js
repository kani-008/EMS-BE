// backend/src/services/admin.service.js
// ALL database logic lives in Postgres functions.
// This file ONLY calls functions — zero raw SQL, zero hardcoded values.
//
// Changes from the MySQL version:
//  - mysql2 `?` placeholders -> pg `$1,$2,...` placeholders
//  - the old two-step "CALL proc(...,@out)" + "SELECT @out" pattern is gone —
//    Postgres functions with OUT params return everything from one
//    `SELECT * FROM proc(...)` call (see config/db.js callProcedure)
//  - createUsersService now calls the unified sp_create_student_user, which
//    merged what used to be two competing procedures
//    (sp_create_student_user + sp_create_student) that wrote to two
//    differently-named dynamic tables. Both this file and
//    modules/staff/staff.service.js now call the same function, so
//    students created via either the /api/admin or /api/staff routes land
//    in the same user_student_<dept> table.
//  - getUsersService no longer relies on sp_get_all_credentials joining
//    across databases (Postgres can't do that) — it now fetches role names
//    from event_management separately and joins them here, in JS.

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
exports.getDepartmentsService = async () => {
  const rows = await callProcedure(eventPool, "sp_get_departments", []);
  return { success: true, data: rows || [] };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET STAFF ROLES SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.getStaffRolesService = async () => {
  const rows = await callProcedure(eventPool, "sp_get_staff_roles", []);
  return { success: true, data: rows || [] };
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATE BATCH SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.validateBatchService = async (batch, course) => {
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
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE STAFF SERVICE  (ADMIN → ADVISOR / HOD / PRINCIPAL …)
// ─────────────────────────────────────────────────────────────────────────────
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

  if (!firstName)   throw new Error("firstName is required");
  if (!staffRole)   throw new Error("staffRole is required");

  if (batch && batch !== "N/A") {
    if (!/^\d{4}$/.test(String(batch).trim())) {
      throw new Error(`batch must be a 4-digit year, got: "${batch}"`);
    }
  }

  if (course && !["B.E", "M.E", "-", ""].includes(String(course).trim())) {
    throw new Error(`course must be "B.E" or "M.E", got: "${course}"`);
  }

  let departmentId = null;
  if (department) {
    const deptRows = await callProcedure(eventPool, "sp_get_department_id_by_name", [department]);
    if (!deptRows || deptRows.length === 0)
      throw new Error(`Department not found: "${department}"`);
    departmentId = deptRows[0].department_id;
  }

  const baseUsername = (firstName + (lastName || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (!baseUsername) throw new Error("Cannot generate username from empty first_name / last_name");

  let generatedUsername = baseUsername;
  let suffix = 0;
  while (true) {
    const { rows } = await eventPool.query(
      "SELECT COUNT(*)::int AS cnt FROM user_faculty WHERE user_name = $1",
      [generatedUsername]
    );
    if (Number(rows[0].cnt) === 0) break;
    suffix += 1;
    generatedUsername = `${baseUsername}${suffix}`;
  }

  const sanitizedPayload = {
    generatedUsername, firstName, lastName: lastName || "", gender: gender || "",
    staffRole, department, departmentId, batch: batch || "N/A", course: course || "-",
  };
  console.log("🔍 createStaffService payload validation:", JSON.stringify(sanitizedPayload, null, 2));

  // ── Step 1: Create staff in Event_Management via sp_create_staff_user ─────
  const spRows = await callProcedure(eventPool, "sp_create_staff_user", [
    generatedUsername,
    firstName,
    lastName    || "",
    gender      || "",
    staffRole,
    departmentId,
    batch       || "N/A",
    currentYear != null ? parseInt(currentYear, 10) : 0,
    course      || "-",
    admin.username,
  ]);
  const outRow = spRows[0];

  if (!outRow || !outRow.p_success) {
    throw new Error(outRow?.p_message || "sp_create_staff_user failed without a message");
  }

  const facultyId = outRow.p_faculty_id;
  const roleId    = outRow.p_role_id;

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
    console.error("❌ Credentials insert failed — rolling back user_faculty:", err.message);
    try {
      await eventPool.query(
        "DELETE FROM user_faculty WHERE user_name = $1 AND faculty_id = $2",
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
  const ctxRows = await callProcedure(eventPool, "sp_get_advisor_context", [advisor.username]);
  if (!ctxRows || ctxRows.length === 0)
    throw new Error("Advisor context not found — ensure your account is registered in user_faculty");

  const ctx            = ctxRows[0];
  const departmentId   = ctx.department_id;
  const departmentName = ctx.department_name;
  const advisorBatch   = ctx.batch;
  const currentYear    = ctx.current_year;

  if (String(advisorBatch) !== String(batch))
    throw new Error(`Batch mismatch: your assigned batch is "${advisorBatch}", cannot create students for batch "${batch}"`);

  console.log(`✅ Advisor context: dept=${departmentName} (${departmentId}), batch=${advisorBatch}, year=${currentYear}`);

  // ── Step 2: Resolve academic_year_id ─────────────────────────────────────
  const ayRows = await callProcedure(eventPool, "sp_get_academic_year_by_batch", [batch]);
  if (!ayRows || ayRows.length === 0)
    throw new Error(`Academic year not found for batch="${batch}". Ensure AY${batch} exists in academic_year table.`);
  const academicYearId = ayRows[0].academic_year_id;

  // ── Step 3: Insert each student (sp_create_student_user ensures the
  //    department table exists internally) ─────────────────────────────────
  const saltRounds     = parseInt(process.env.BCRYPT_SALT || "10", 10);
  const insertedInAuth = [];
  let tableName = null;

  for (let i = from; i <= to; i++) {
    const paddedNum   = String(i).padStart(2, "0");
    const username    = `${prefix}${paddedNum}`;
    const rawPassword = `${prefix}${paddedNum}@2024`;
    const hashedPwd   = await bcrypt.hash(rawPassword, saltRounds);

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

    // 4b — Event_Management
    try {
      const spRows = await callProcedure(eventPool, "sp_create_student_user", [
        advisor.username,   // advisor validated inside the function
        username,           // roll_no
        username,           // user_name
        "",                 // first_name (unknown for range-created students)
        "",                 // last_name
        "",                 // gender
        "",                 // registration_no
        academicYearId,
        currentYear,
        course,
        semester || null,
        batch,
        advisor.username,   // created_by
      ]);
      const outRow = spRows[0];
      if (!outRow || !outRow.p_success) {
        throw new Error(outRow?.p_message || "sp_create_student_user failed");
      }
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
exports.updateStaffService = async (req, payload) => {
  const admin = req.user;

  const { facultyId, firstName, lastName, department, batch, currentYear, role } = payload;

  if (!facultyId) throw new Error("facultyId is required");

  let departmentId = null;
  if (department && String(department).trim()) {
    const deptRows = await callProcedure(eventPool, "sp_get_department_id_by_name", [department.trim()]);
    if (!deptRows || deptRows.length === 0)
      throw new Error(`Department not found: "${department}"`);
    departmentId = deptRows[0].department_id;
  }

  let roleId = null;
  if (role && String(role).trim()) {
    const roleRows = await callProcedure(eventPool, "sp_get_role_id_by_name", [role.trim()]);
    if (!roleRows || roleRows.length === 0)
      throw new Error(`Role not found: "${role}"`);
    roleId = roleRows[0].user_role_id;
  }

  const spRows = await callProcedure(eventPool, "sp_update_staff_user", [
    facultyId,
    firstName   ? firstName.trim()  : null,
    lastName    ? lastName.trim()   : null,
    departmentId,
    batch       ? batch.trim()      : null,
    currentYear != null ? parseInt(currentYear, 10) : null,
    roleId,
    admin.username,
  ]);
  const outRow = spRows[0];

  if (!outRow || !outRow.p_success) {
    throw new Error(outRow?.p_message || "sp_update_staff_user failed");
  }

  console.log(`✅ Staff updated: ${facultyId} by ${admin.username}`);
  return { success: true, message: outRow.p_message };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET USERS SERVICE
// ─────────────────────────────────────────────────────────────────────────────
exports.getUsersService = async (req) => {
  const user = req?.user;
  const eventUsers = await callProcedure(eventPool, "sp_get_all_users", []);
  if (!eventUsers || eventUsers.length === 0)
    return { success: true, data: [], total: 0 };

  // Postgres can't join across the two databases the way the old MySQL
  // stored procedure did, so the role-name lookup is done here in JS:
  // fetch raw credential rows + role names separately, then merge.
  const credRows  = await callProcedure(authPool, "sp_get_all_credentials", []);
  const roleRows  = await callProcedure(eventPool, "sp_get_staff_roles", []); // excludes STUDENT
  const allRoles  = await eventPool.query("SELECT user_role_id, user_role FROM user_role");
  const roleNameById = {};
  allRoles.rows.forEach((r) => { roleNameById[r.user_role_id] = r.user_role; });

  const credMap = {};
  (credRows || []).forEach((c) => {
    credMap[c.user_name] = {
      status:   c.status,
      userRole: roleNameById[c.user_role_id] || "Unknown",
    };
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
      createdBy:       u.last_updated_by || null,
      first_name:      u.first_name || "",
      last_name:       u.last_name  || "",
      user_name:       u.user_name,
      roll_no:         u.roll_no    || null,
      current_year:    u.current_year || null,
    };
  });

  if (user && user.role === "ADVISOR") {
    const ctxRows = await callProcedure(eventPool, "sp_get_advisor_context", [user.username]);
    if (ctxRows && ctxRows.length > 0) {
      const ctx = ctxRows[0];
      finalData = finalData.filter((u) => {
        return String(u.userRole).toUpperCase() === "STUDENT" &&
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
exports.bulkCreateStaffService = async (req, rows) => {
  const admin      = req.user;
  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);

  const allDepts = await callProcedure(eventPool, "sp_get_departments", []);
  const deptMap  = {};
  (allDepts || []).forEach((d) => {
    deptMap[String(d.department_name).toUpperCase()] = d.department_id;
  });

  const allRoles = await callProcedure(eventPool, "sp_get_staff_roles", []);
  const roleSet  = new Set((allRoles || []).map((r) => String(r.user_role).toUpperCase()));

  const results   = [];
  const succeeded = [];
  const failed    = [];

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 2;

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

    if (roleName === "ADVISOR" && batchRaw && !/^\d{4}$/.test(batchRaw)) {
      rowErrors.push(`batch must be a 4-digit year for ADVISOR, got: "${batchRaw}"`);
    }

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

    console.log(`📝 Row ${rowNum} validated: firstName="${firstName}", lastName="${lastName}", gender="${gender}", role="${roleName}", batch="${batchVal}", course="${course}"`);

    const currentYearRaw = String(row.current_year ?? row.currentYear ?? "").trim();
    const currentYearVal = /^\d+$/.test(currentYearRaw) ? parseInt(currentYearRaw, 10) : 0;

    let username  = null;
    let facultyId = null;
    let roleId    = null;
    try {
      const spRows = await callProcedure(eventPool, "sp_bulk_create_staff", [
        firstName, lastName || "", gender, roleName, departmentId ?? null,
        batchVal, course, currentYearVal, admin.username,
      ]);
      const spOut = spRows[0];

      if (!spOut || !spOut.p_success) {
        failed.push({ row: rowNum, data: row, errors: [spOut?.p_message || "sp_bulk_create_staff failed"] });
        continue;
      }

      username  = spOut.p_username;
      facultyId = spOut.p_faculty_id;
      roleId    = spOut.p_role_id;
    } catch (err) {
      failed.push({ row: rowNum, data: row, errors: [err.message] });
      continue;
    }

    const rawPassword = `${username}7311`;
    const hashedPwd   = await bcrypt.hash(rawPassword, saltRounds);

    try {
      await callProcedure(authPool, "sp_insert_login", [
        username, hashedPwd, roleId, departmentId ?? null, "ACTIVE", admin.username,
      ]);
    } catch (err) {
      console.error(`❌ Credentials insert failed for row ${rowNum} (${username}), rolling back:`, err.message);
      try {
        await eventPool.query(
          "DELETE FROM user_faculty WHERE user_name = $1 AND faculty_id = $2",
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
exports.getAdminProfileService = async (req) => {
  const { username, role, roleId } = req.user;

  const { rows: credRows } = await authPool.query(
    `SELECT user_name, user_role_id, department_id, status FROM table_login WHERE user_name = $1 LIMIT 1`,
    [username]
  );
  const credRow = credRows[0];

  const { rows: facRows } = await eventPool.query(
    `SELECT uf.first_name, uf.last_name, uf.gender, uf.contact, uf.department_id,
            d.department_name, uf.user_profile
     FROM user_faculty uf
     LEFT JOIN department d ON uf.department_id = d.department_id
     WHERE uf.user_name = $1 LIMIT 1`,
    [username]
  );
  const facRow = facRows[0];

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
exports.updateAdminProfileService = async (req, payload) => {
  const { username } = req.user;
  const { phone, currentPassword, newPassword } = payload;

  if (phone !== undefined) {
    await eventPool.query(
      `UPDATE user_faculty SET contact = $1, last_updated_by = $2 WHERE user_name = $3`,
      [String(phone).trim(), username, username]
    );
  }

  if (newPassword) {
    if (!currentPassword) throw new Error("Current password is required to set a new password");

    const { rows } = await authPool.query(
      `SELECT password FROM table_login WHERE user_name = $1 LIMIT 1`,
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
      `UPDATE table_login SET password = $1, last_updated_by = $2 WHERE user_name = $3`,
      [newHash, username, username]
    );
  }

  return { success: true, message: "Profile updated successfully" };
};
