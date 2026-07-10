const { eventPool, callProcedure } = require("../config/db");

async function getDepartmentsService() {
  const rows = await callProcedure(eventPool, "sp_get_departments", []);
  return { success: true, data: rows || [] };
}

exports.getDepartments = async (req, res) => {
  try {
    const result = await getDepartmentsService();
    return res.json(result);
  } catch (err) {
    console.error("❌ getDepartments error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
