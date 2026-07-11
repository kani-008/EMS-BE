// src/services/userService.js
// Business logic for user listing — used by the Admin's User Management page.
// No req/res handling. Returns data or throws.

const { authPool, eventPool, callProcedure } = require("../config/db");
const { updateStudentStatusService } = require("./studentService");
const { updateStaffStatusService } = require("./staffService");

async function getUsersService(callerUser, filters = {}) {
  // Normalize filters to arrays or null
  let roles = null;
  if (filters.role && filters.role.length > 0) {
    roles = [];
    const roleArr = Array.isArray(filters.role) ? filters.role : [filters.role];
    roleArr.forEach((r) => {
      if (r.toUpperCase() === "STUDENT") {
        roles.push("STUDENT");
      } else if (r.toUpperCase() === "STAFF") {
        roles.push("ADVISOR", "HOD", "PRINCIPAL", "FACULTY", "PLACEMENT", "SPORTS");
      }
    });
  }

  const courses = filters.course && filters.course.length > 0
    ? (Array.isArray(filters.course) ? filters.course : [filters.course])
    : null;

  const years = filters.year && filters.year.length > 0
    ? (Array.isArray(filters.year) ? filters.year : [filters.year]).map(y => parseInt(y, 10))
    : null;

  const semesters = filters.semester && filters.semester.length > 0
    ? (Array.isArray(filters.semester) ? filters.semester : [filters.semester]).map(s => parseInt(s, 10))
    : null;

  const batches = filters.batch && filters.batch.length > 0
    ? (Array.isArray(filters.batch) ? filters.batch : [filters.batch]).map(String)
    : null;

  const statuses = filters.status && filters.status.length > 0
    ? (Array.isArray(filters.status) ? filters.status : [filters.status]).map(s => s.toUpperCase())
    : null;

  const eventUsers = await callProcedure(eventPool, "sp_get_all_users", [
    roles,
    courses,
    years,
    semesters,
    batches,
    statuses
  ]);

  if (!eventUsers || eventUsers.length === 0)
    return { success: true, data: [], total: 0, active: 0, inactive: 0 };

  const credRows = await callProcedure(authPool, "sp_get_all_credentials", []);
  const credMap = {};
  (credRows || []).forEach((c) => {
    credMap[c.user_name] = {
      status:   c.status,
      userRole: c.user_role_name || "Unknown",
    };
  });

  let finalData = eventUsers.map((u) => {
    const cred = credMap[u.user_name] || {};
    const finalStatus = String(u.status || cred.status || "INACTIVE").toUpperCase();
    return {
      userId:          u.roll_no || u.faculty_id,
      fullName:        u.full_name
                         ? u.full_name.trim() || u.user_name
                         : `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.user_name,
      faculty_id:      u.faculty_id      || null,
      userName:        `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.user_name,
      course:          u.course          || null,
      department:      u.department_name || "Unknown",
      department_name: u.department_name || "Unknown",
      year:            u.current_year    || null,
      batch:           u.batch           || null,
      batchYear:       u.batch           || null,
      semester:        u.semester        || null,
      registrationNo:  u.registration_no || null,
      registration_no: u.registration_no || null,
      status:          finalStatus,
      userRole:        cred.userRole || u.base_role || u.user_role || "Unknown",
      createdAt:       u.created_on      || null,
      timestamp:       u.created_on      || null,
      createdBy:       u.last_updated_by || null,
      first_name:      u.first_name      || "",
      last_name:       u.last_name       || "",
      user_name:       u.user_name,
      roll_no:         u.roll_no         || null,
      current_year:    u.current_year    || null,
    };
  });

  if (callerUser && callerUser.role === "ADVISOR") {
    const ctxRows = await callProcedure(eventPool, "sp_get_advisor_context", [callerUser.username]);
    if (ctxRows && ctxRows.length > 0) {
      const ctx = ctxRows[0];
      finalData = finalData.filter((u) =>
        String(u.userRole).toUpperCase() === "STUDENT" &&
        String(u.department_name) === String(ctx.department_name) &&
        String(u.batch) === String(ctx.batch)
      );
    } else {
      finalData = [];
    }
  }

  finalData.sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt) : 0;
    const db = b.createdAt ? new Date(b.createdAt) : 0;
    return db - da;
  });

  const activeCount = finalData.filter(u => u.status === 'ACTIVE').length;
  const inactiveCount = finalData.filter(u => u.status === 'INACTIVE' || u.status === 'UNVERIFIED').length;

  return {
    success: true,
    data: finalData,
    total: finalData.length,
    active: activeCount,
    inactive: inactiveCount
  };
}

async function deleteUserService(callerUser, userName) {
  const rows = await callProcedure(authPool, "sp_soft_delete_user", [
    String(userName).toLowerCase(),
    callerUser.username,
  ]);
  const outRow = rows && rows[0];
  if (!outRow || !outRow.p_success) {
    throw new Error(outRow?.p_message || "Failed to delete user");
  }
  return { success: true, message: outRow.p_message };
}

async function updateBulkStatusService(callerUser, userIds, status) {
  const targetStatus = String(status).toUpperCase();
  if (targetStatus !== "ACTIVE" && targetStatus !== "INACTIVE") {
    throw new Error("Invalid status. Must be ACTIVE or INACTIVE");
  }

  const results = [];
  for (const id of userIds) {
    const { rows } = await authPool.query(
      "SELECT user_role_id FROM credentials.table_login WHERE user_name = $1",
      [String(id).toLowerCase()]
    );
    if (rows.length === 0) {
      results.push({ id, success: false, message: "User not found" });
      continue;
    }
    const isStudent = rows[0].user_role_id === "R01";
    try {
      if (isStudent) {
        await updateStudentStatusService(callerUser, id, targetStatus);
      } else {
        await updateStaffStatusService(callerUser, id, targetStatus);
      }
      results.push({ id, success: true });
    } catch (err) {
      results.push({ id, success: false, message: err.message });
    }
  }
  return { success: true, results };
}

module.exports = { getUsersService, updateBulkStatusService, deleteUserService };
