// src/controllers/userController.js
// Express request handlers for user-listing routes.
// All business logic lives in src/services/userService.js.

const { getUsersService, updateBulkStatusService } = require("../services/userService");
const { eventPool, callProcedure } = require("../config/db");

exports.getUsers = async (req, res) => {
  try {
    // Pass query params (filters) to the service
    const result = await getUsersService(req.user, req.query);
    return res.json(result);
  } catch (err) {
    console.error("❌ getUsers error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateBulkStatus = async (req, res) => {
  try {
    const { userIds, status } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: "userIds array is required" });
    }
    if (!status) {
      return res.status(400).json({ success: false, message: "status is required" });
    }
    const result = await updateBulkStatusService(req.user, userIds, status);
    return res.json(result);
  } catch (err) {
    console.error("❌ updateBulkStatus error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.getFilterOptions = async (req, res) => {
  try {
    const rows = await callProcedure(eventPool, "sp_get_filter_options", []);
    if (rows && rows.length > 0) {
      const opt = rows[0];
      
      // Map roles to match "Student" / "Staff" choices expected by frontend
      const mappedRoles = [];
      const rawRoles = opt.roles || [];
      if (rawRoles.some(r => r.toUpperCase() === "STUDENT")) {
        mappedRoles.push("Student");
      }
      if (rawRoles.some(r => r.toUpperCase() !== "STUDENT" && r.toUpperCase() !== "ADMIN")) {
        mappedRoles.push("Staff");
      }

      return res.json({
        success: true,
        data: {
          courses: opt.courses || [],
          years: (opt.years || []).map(String),
          semesters: (opt.semesters || []).map(String),
          statuses: (opt.statuses || []).map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()),
          roles: mappedRoles,
        }
      });
    }
    return res.json({ success: true, data: { courses: [], years: [], semesters: [], statuses: [], roles: [] } });
  } catch (err) {
    console.error("❌ getFilterOptions error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
