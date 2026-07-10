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

async function createStaffService(req, payload) {
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
    throw new Error(outRow?.p_message || "sp_create_staff_user failed");
  }

  const facultyId = outRow.p_faculty_id;
  const roleId    = outRow.p_role_id;

  const saltRounds  = parseInt(process.env.BCRYPT_SALT || "10", 10);
  const isSystemGenerated = !password;
  const rawPassword = password ? String(password).trim() : generateRandomPassword();
  const hashedPwd   = await bcrypt.hash(rawPassword, saltRounds);

  try {
    const result = await callProcedure(
      authPool,
      "sp_insert_login",
      [generatedUsername, hashedPwd, roleId, departmentId, "ACTIVE", admin.username]
    );
    const wasInserted = result && result[0] ? Number(result[0].inserted) : 1;
    if (!wasInserted)
      throw new Error(`Username already exists in credentials: "${generatedUsername}"`);

    // Set must_change_password (BUG 3)
    await authPool.query(
      `UPDATE credentials.table_login SET must_change_password = $1 WHERE user_name = $2`,
      [isSystemGenerated, generatedUsername]
    );
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

  return {
    success:     true,
    message:     `Staff "${generatedUsername}" created successfully (${facultyId})`,
    facultyId,
    username:    generatedUsername,
    role:        staffRole,
    department,
    batch:       batch || "N/A",
    currentYear: currentYear != null ? parseInt(currentYear, 10) : 0,
    password:    rawPassword,
  };
}

async function updateStaffService(req, payload) {
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

  return { success: true, message: outRow.p_message };
}

async function bulkCreateStaffService(req, rows) {
  const admin      = req.user;
  const saltRounds = parseInt(process.env.BCRYPT_SALT || "10", 10);

  const allDepts = await callProcedure(eventPool, "sp_get_departments", []);
  const deptMap  = {};
  (allDepts || []).forEach((d) => {
    deptMap[String(d.department_name).toUpperCase()] = d.department_id;
  });

  const allRoles = await callProcedure(eventPool, "sp_get_staff_roles", []);
  const roleSet  = new Set((allRoles || []).map((r) => String(r.user_role).toUpperCase()));

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
    
    // department is NOT required for PRINCIPAL (BUG 4)
    if (!department && roleName !== "PRINCIPAL") {
      rowErrors.push("department is required");
    }
    if (!roleName)   rowErrors.push("role is required");

    const departmentId = deptMap[department.toUpperCase()] || null;
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

    const currentYearRaw = String(row.current_year ?? row.currentYear ?? "").trim();
    const currentYearVal = /^\d+$/.test(currentYearRaw) ? parseInt(currentYearRaw, 10) : 0;

    let username  = null;
    let facultyId = null;
    let roleId    = null;
    try {
      const spRows = await callProcedure(eventPool, "sp_bulk_create_staff", [
        firstName, lastName || "", gender, roleName, departmentId,
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

    const rawPassword = generateRandomPassword();
    const hashedPwd   = await bcrypt.hash(rawPassword, saltRounds);

    try {
      await callProcedure(authPool, "sp_insert_login", [
        username, hashedPwd, roleId, departmentId, "ACTIVE", admin.username,
      ]);

      // Set must_change_password (BUG 3)
      await authPool.query(
        `UPDATE credentials.table_login SET must_change_password = true WHERE user_name = $1`,
        [username]
      );
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

    succeeded.push({ row: rowNum, username, facultyId, fullName: `${firstName} ${lastName}`.trim(), password: rawPassword });
  }

  return {
    success:   true,
    total:     rows.length,
    created:   succeeded.length,
    failed:    failed.length,
    succeeded,
    errors:    failed,
  };
}

async function getAdvisorContextService(req) {
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
    },
  };
}

exports.validateBatch = async (req, res) => {
  try {
    const { batch, course } = req.query;
    if (!batch || !course) {
      return res.status(400).json({ success: false, message: "batch and course query params are required" });
    }
    const result = await validateBatchService(batch, course);
    return res.json(result);
  } catch (err) {
    console.error("❌ validateBatch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStaff = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      gender,
      department,
      staffRole,
      batch,
      course,
      currentYear,
      password,
    } = req.body;

    const result = await createStaffService(req, {
      firstName,
      lastName,
      gender,
      department,
      staffRole,
      batch,
      course,
      currentYear,
      password,
    });

    return res.json(result);
  } catch (err) {
    console.error("createStaff error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { firstName, lastName, department, batch, currentYear, role } = req.body;

    const result = await updateStaffService(req, {
      facultyId,
      firstName,
      lastName,
      department,
      batch,
      currentYear,
      role,
    });

    return res.json(result);
  } catch (err) {
    console.error("updateStaff error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.uploadStaffExcel = async (req, res) => {
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

    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ success: false, message: "The uploaded file contains no data rows." });
    }

    // Limit to 500 rows to prevent resource exhaustion (BUG 6)
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

    const result = await bulkCreateStaffService(req, rows);
    return res.json(result);
  } catch (err) {
    console.error("uploadStaffExcel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAdvisorContext = async (req, res) => {
  try {
    const result = await getAdvisorContextService(req);
    return res.json(result);
  } catch (err) {
    console.error("❌ staff.getAdvisorContext error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateStaffStatus = async (req, res) => {
  try {
    const caller = req.user;
    const { facultyId } = req.params;
    const { status } = req.body;

    if (caller.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Unauthorized: only administrators can change staff status" });
    }

    if (!facultyId || !status) {
      return res.status(400).json({ success: false, message: "Faculty ID and status are required" });
    }

    const targetStatus = String(status).toUpperCase();
    if (targetStatus !== "ACTIVE" && targetStatus !== "INACTIVE") {
      return res.status(400).json({ success: false, message: "Invalid status value. Must be ACTIVE or INACTIVE" });
    }

    const facultyRows = await eventPool.query(
      "SELECT user_name FROM event_management.user_faculty WHERE faculty_id = $1 LIMIT 1",
      [facultyId]
    );
    if (facultyRows.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Staff member not found" });
    }
    const staffUsername = facultyRows.rows[0].user_name;

    await authPool.query(
      "UPDATE credentials.table_login SET status = $1, last_updated_by = $2 WHERE user_name = $3",
      [targetStatus, caller.username, staffUsername]
    );

    return res.json({ success: true, message: `Staff status successfully updated to ${targetStatus}` });
  } catch (err) {
    console.error("❌ updateStaffStatus error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

