// src/controllers/requestController.js
// HTTP handlers for request management. Delegates all logic to requestService.

const {
  getRequestsService,
  createRequestService,
  updateRequestStatusService,
  deleteRequestService,
  getRequestTypesService,
  getProgressStatusesService,
} = require("../services/requestService");

// ── GET /api/requests ─────────────────────────────────────────────────────────

const getRequests = async (req, res) => {
  try {
    console.log({ route: "GET /api/requests", user: req.user.username, role: req.user.role });
    const result = await getRequestsService(req.user);
    res.status(200).json(result);
  } catch (err) {
    console.error("GET /api/requests error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/requests ────────────────────────────────────────────────────────

const createRequest = async (req, res) => {
  try {
    console.log({ route: "POST /api/requests", user: req.user.username });
    const result = await createRequestService(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error("POST /api/requests error:", err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── PATCH /api/requests/:requestId/status ─────────────────────────────────────

const updateRequestStatus = async (req, res) => {
  const { requestId } = req.params;
  try {
    console.log({ route: `PATCH /api/requests/${requestId}/status`, user: req.user.username, action: req.body.action });
    const result = await updateRequestStatusService(req.user, requestId, req.body);
    res.status(200).json(result);
  } catch (err) {
    console.error(`PATCH /api/requests/${requestId}/status error:`, err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/requests/:requestId ──────────────────────────────────────────

const deleteRequest = async (req, res) => {
  const { requestId } = req.params;
  try {
    console.log({ route: `DELETE /api/requests/${requestId}`, user: req.user.username });
    const result = await deleteRequestService(req.user, requestId);
    res.status(200).json(result);
  } catch (err) {
    console.error(`DELETE /api/requests/${requestId} error:`, err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── GET /api/requests/types ───────────────────────────────────────────────────

const getRequestTypes = async (req, res) => {
  try {
    const result = await getRequestTypesService();
    res.status(200).json(result);
  } catch (err) {
    console.error("GET /api/requests/types error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/requests/statuses ────────────────────────────────────────────────

const getProgressStatuses = async (req, res) => {
  try {
    const result = await getProgressStatusesService();
    res.status(200).json(result);
  } catch (err) {
    console.error("GET /api/requests/statuses error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getRequests,
  createRequest,
  updateRequestStatus,
  deleteRequest,
  getRequestTypes,
  getProgressStatuses,
};
