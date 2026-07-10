const { eventPool, callProcedure } = require("../config/db");

async function getStaffRolesService() {
  const rows = await callProcedure(eventPool, "sp_get_staff_roles", []);
  return { success: true, data: rows || [] };
}

exports.getStaffRoles = async (req, res) => {
  try {
    const result = await getStaffRolesService();
    return res.json(result);
  } catch (err) {
    console.error("❌ getStaffRoles error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
