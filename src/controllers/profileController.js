// src/controllers/profileController.js
// Express request handlers for profile routes.
// All business logic lives in src/services/profileService.js.

const {
  STAFF_ROLES,
  getStudentProfileService,
  updateStudentProfileService,
  changeStudentPasswordService,
  getStaffProfileService,
  updateStaffProfileService,
  getAdminProfileService,
  updateAdminProfileService,
} = require("../services/profileService");

exports.getProfile = async (req, res) => {
  const { username, role, roleId } = req.user;
  try {
    let result;
    if (role === "STUDENT") {
      result = await getStudentProfileService(username);
    } else if (role === "ADMIN") {
      result = await getAdminProfileService(username, role, roleId);
    } else if (STAFF_ROLES.includes(role)) {
      result = await getStaffProfileService(username, role, roleId);
    } else {
      return res.status(403).json({ success: false, message: `Unknown role: "${role}"` });
    }
    return res.json(result);
  } catch (err) {
    console.error(`❌ getProfile [${role}] error:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  const { username, role } = req.user;
  try {
    let result;
    if (role === "STUDENT") {
      const { first_name, last_name, registration_no, gender } = req.body;
      result = await updateStudentProfileService(username, { first_name, last_name, registration_no, gender });
    } else if (role === "ADMIN") {
      const { firstName, lastName, gender, currentPassword, newPassword, confirmPassword } = req.body;
      if (newPassword && newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: "New passwords do not match" });
      }
      result = await updateAdminProfileService(username, { firstName, lastName, gender, currentPassword, newPassword });
    } else if (STAFF_ROLES.includes(role)) {
      const { phone, currentPassword, newPassword, confirmPassword } = req.body;
      if (newPassword && newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: "New passwords do not match" });
      }
      result = await updateStaffProfileService(username, { phone, currentPassword, newPassword });
    } else {
      return res.status(403).json({ success: false, message: `Unknown role: "${role}"` });
    }
    return res.json(result);
  } catch (err) {
    console.error(`❌ updateProfile [${role}] error:`, err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.changePassword = async (req, res) => {
  const { username, role } = req.user;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    if (newPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "New passwords do not match" });
    }

    let result;
    if (role === "STUDENT") {
      result = await changeStudentPasswordService(username, { currentPassword, newPassword });
    } else if (role === "ADMIN") {
      result = await updateAdminProfileService(username, { currentPassword, newPassword });
    } else if (STAFF_ROLES.includes(role)) {
      result = await updateStaffProfileService(username, { currentPassword, newPassword });
    } else {
      return res.status(403).json({ success: false, message: `Unknown role: "${role}"` });
    }
    return res.json(result);
  } catch (err) {
    console.error(`❌ changePassword [${role}] error:`, err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};
