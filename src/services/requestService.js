// src/services/requestService.js
// Business logic for request management.
// All functions return data or throw — no req/res handling.

const { eventPool, callProcedure } = require("../config/db");

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map a raw DB row to the shape the frontend expects.
 * Keeps field names aligned with the existing DummyRequests shape so
 * frontend components work without renaming.
 */
function normalizeRequest(r) {
  return {
    reqId:           r.request_id,
    requestFrom:     r.requested_from,
    requestTo:       r.requested_to,
    requestCategory: r.request_type   || "-",
    requestTypeId:   r.request_type_id,
    status:          r.request_status  || "Pending",
    statusId:        r.request_status_id,
    year:            r.current_year,
    semester:        r.semester,
    course:          r.course_id       || "-",
    department:      r.department_name || "-",
    timestamp:       r.created_on,
    requestDate:     r.request_date,
    reason:          r.request_reason,
  };
}

// ── GET REQUESTS ─────────────────────────────────────────────────────────────

async function getRequestsService(callerUser) {
  const rows = await callProcedure(eventPool, "sp_get_requests", [
    callerUser.username,
    callerUser.role,
  ]);

  return {
    success: true,
    data: (rows || []).map(normalizeRequest),
    total: (rows || []).length,
  };
}

// ── CREATE REQUEST ────────────────────────────────────────────────────────────

async function createRequestService(callerUser, payload) {
  const {
    requestedTo,
    requestTypeId,
    academicYearId,
    courseId,
    departmentId,
    currentYear,
    semester,
    requestReason,
    requestDate,
  } = payload;

  if (!requestTypeId) throw new Error("requestTypeId is required");
  if (!requestedTo)   throw new Error("requestedTo is required");

  const rows = await callProcedure(eventPool, "sp_create_request", [
    callerUser.username,
    String(requestedTo).trim(),
    String(requestTypeId).trim(),
    academicYearId  ? String(academicYearId).trim()      : null,
    courseId        ? String(courseId).trim()             : null,
    departmentId    ? parseInt(departmentId, 10)          : null,
    currentYear     ? parseInt(currentYear, 10)           : null,
    semester        ? parseInt(semester, 10)              : null,
    requestReason   ? String(requestReason).trim()        : null,
    requestDate     || new Date().toISOString().split("T")[0],
  ]);

  const result = rows?.[0];
  if (!result?.success) {
    throw new Error(result?.message || "Failed to create request");
  }

  return {
    success:   true,
    requestId: result.request_id,
    message:   result.message,
  };
}

// ── UPDATE REQUEST STATUS ──────────────────────────────────────────────────────

const STATUS_MAP = {
  accept:  "PS3",  // Accepted
  decline: "PS4",  // Declined
  forward: "PS2",  // Forwarded
};

async function updateRequestStatusService(callerUser, requestId, payload) {
  const { action, forwardedTo } = payload;

  const statusId = STATUS_MAP[String(action || "").toLowerCase()];
  if (!statusId) throw new Error(`Invalid action '${action}'. Use accept | decline | forward.`);

  const rows = await callProcedure(eventPool, "sp_update_request_status", [
    String(requestId).trim(),
    statusId,
    callerUser.username,
    forwardedTo ? String(forwardedTo).trim() : null,
  ]);

  const result = rows?.[0];
  if (!result?.success) {
    throw new Error(result?.message || "Failed to update request status");
  }

  return { success: true, message: result.message };
}

// ── DELETE REQUEST ─────────────────────────────────────────────────────────────

async function deleteRequestService(callerUser, requestId) {
  // ADMIN can delete any request; everyone else is scoped to their own
  const usernameArg =
    callerUser.role === "ADMIN" ? "ADMIN" : callerUser.username;

  const rows = await callProcedure(eventPool, "sp_delete_request", [
    String(requestId).trim(),
    usernameArg,
  ]);

  const result = rows?.[0];
  if (!result?.success) {
    throw new Error(result?.message || "Failed to delete request");
  }

  return { success: true, message: result.message };
}

// ── GET REQUEST TYPES (reference data) ─────────────────────────────────────────

async function getRequestTypesService() {
  const rows = await callProcedure(eventPool, "sp_get_request_types", []);
  return {
    success: true,
    data: (rows || []).map((r) => ({
      value: r.request_type_id,
      label: r.request_type,
    })),
  };
}

// ── GET PROGRESS STATUSES (reference data for Settings) ─────────────────────────

async function getProgressStatusesService() {
  const rows = await callProcedure(eventPool, "sp_get_progress_statuses", []);
  return {
    success: true,
    data: (rows || []).map((r) => ({
      id:     r.request_status_id,
      status: r.request_status,
    })),
  };
}

module.exports = {
  getRequestsService,
  createRequestService,
  updateRequestStatusService,
  deleteRequestService,
  getRequestTypesService,
  getProgressStatusesService,
};
