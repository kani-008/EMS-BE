const { authPool, eventPool, callProcedure } = require("../config/db");

async function getUsersService(req) {
  const user = req?.user;
  const eventUsers = await callProcedure(eventPool, "sp_get_all_users", []);
  if (!eventUsers || eventUsers.length === 0)
    return { success: true, data: [], total: 0 };

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
    return {
      userId:          u.roll_no || u.faculty_id,
      fullName:        u.full_name
                         ? u.full_name.trim() || u.user_name
                         : `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.user_name,
      faculty_id:      u.faculty_id || null,
      userName:        `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.user_name,
      course:          u.course || null,
      department:      u.department_name || "Unknown",
      department_name: u.department_name || "Unknown",
      year:            u.current_year    || null,
      batch:           u.batch           || null,
      batchYear:       u.batch           || null,
      semester:        u.semester        || null,
      registrationNo:  u.registration_no || null,
      registration_no: u.registration_no || null,
      status:          String(cred.status || "INACTIVE").toUpperCase(),
      userRole:        cred.userRole || u.base_role || "Unknown",
      createdAt:       u.created_on || null,
      timestamp:       u.created_on || null,
      createdBy:       u.last_updated_by || null,
      first_name:      u.first_name || "",
      last_name:       u.last_name  || "",
      user_name:       u.user_name,
      roll_no:         u.roll_no    || null,
      current_year:    u.current_year || null,
    };
  });

  if (user && user.role === "ADVISOR") {
    const ctxRows = await callProcedure(eventPool, "sp_get_advisor_context", [user.username]);
    if (ctxRows && ctxRows.length > 0) {
      const ctx = ctxRows[0];
      finalData = finalData.filter((u) => {
        return String(u.userRole).toUpperCase() === "STUDENT" &&
               String(u.department_name) === String(ctx.department_name) &&
               String(u.batch) === String(ctx.batch);
      });
    } else {
      finalData = [];
    }
  }

  finalData.sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt) : 0;
    const db = b.createdAt ? new Date(b.createdAt) : 0;
    return db - da;
  });

  return { success: true, data: finalData, total: finalData.length };
}

exports.getUsers = async (req, res) => {
  try {
    const result = await getUsersService(req);
    return res.json(result);
  } catch (err) {
    console.error("❌ getUsers error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};
