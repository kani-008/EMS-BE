// src/controllers/userController.js
// Express request handlers for user-listing routes.
// All business logic lives in src/services/userService.js.

const { getUsersService } = require("../services/userService");

exports.getUsers = async (req, res) => {
  try {
    const result = await getUsersService(req.user);
    return res.json(result);
  } catch (err) {
    console.error("❌ getUsers error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};
