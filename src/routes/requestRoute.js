// src/routes/requestRoute.js
// Express router for all /api/requests endpoints.

const express = require("express");
const router  = express.Router();
const requestController = require("../controllers/requestController");
const { verifyToken, allowRoles } = require("../middleware/auth");

const STAFF_ROLES = ["ADVISOR", "HOD", "PRINCIPAL", "FACULTY", "PLACEMENT", "SPORTS"];

// ── Reference data (no role restriction beyond authentication) ───────────────
// IMPORTANT: specific sub-paths must come BEFORE /:requestId to avoid routing
// conflicts (otherwise "types" and "statuses" would be treated as requestId).
router.get("/types",verifyToken,requestController.getRequestTypes);

router.get(
  "/statuses",
  verifyToken,
  requestController.getProgressStatuses
);

// ── List requests (role-filtered inside service) ──────────────────────────────
router.get(
  "/",
  verifyToken,
  requestController.getRequests
);

// ── Create request ────────────────────────────────────────────────────────────
// Any authenticated user (students submit their own; admins may submit on behalf)
router.post(
  "/",
  verifyToken,
  requestController.createRequest
);

// ── Update status (accept / decline / forward) ────────────────────────────────
// Only staff/admin roles; students cannot change status
router.patch(
  "/:requestId/status",
  verifyToken,
  allowRoles("ADMIN", ...STAFF_ROLES),
  requestController.updateRequestStatus
);

// ── Delete a request ──────────────────────────────────────────────────────────
// Students (own requests) or ADMIN (any request); service enforces ownership
router.delete(
  "/:requestId",
  verifyToken,
  requestController.deleteRequest
);

module.exports = router;
