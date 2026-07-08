// backend/src/services/user.service.js
/**
 * User Management Service
 * 
 * This service provides abstraction layer for user management operations,
 * delegating to stored procedures for data integrity and security.
 * 
 * All user management operations are performed through stored procedures:
 * - sp_create_user: Create new user with validation
 * - sp_get_users: Fetch all users with roles and departments
 * - sp_get_user_by_username: Fetch single user details
 * - sp_update_user_status: Update user status (ACTIVE/INACTIVE/SUSPENDED)
 * - sp_delete_user: Soft delete user (mark as INACTIVE)
 */

const { authPool, callProcedure } = require("../config/db");

/**
 * Create a new user using stored procedure
 * @param {string} username - Username (must be unique)
 * @param {string} passwordHash - Bcrypt hashed password
 * @param {string} roleId - User role ID (e.g., R01, R02, R03)
 * @param {number} departmentId - Department ID
 * @param {string} status - User status (ACTIVE, INACTIVE, SUSPENDED)
 * @param {string} createdBy - Username of admin creating the user
 * @returns {Object} { success: boolean, message: string }
 */
exports.createUser = async (username, passwordHash, roleId, departmentId, status, createdBy) => {
  try {
    console.log(`🔐 Creating user via stored procedure: ${username}`);
    
    // callProcedure returns the OUT parameters from the procedure
    // For procedures with OUT params, we need to handle the response differently
    const result = await authPool.query(
      `CALL sp_create_user(?, ?, ?, ?, ?, ?, @p_success, @p_message)`,
      [username, passwordHash, roleId, departmentId, status, createdBy]
    );

    // After the procedure, fetch the OUT parameters
    const [outParams] = await authPool.query(
      `SELECT @p_success as success, @p_message as message`
    );

    const { success, message } = outParams[0];

    if (!success) {
      throw new Error(message);
    }

    console.log(`✅ User created: ${username}`);
    return { success: true, message };
  } catch (err) {
    console.error(`❌ Error creating user ${username}:`, err.message);
    throw err;
  }
};

/**
 * Get all users with their roles and department information
 * @returns {Array} Array of user objects with full details
 */
exports.getAllUsers = async () => {
  try {
    console.log(`📋 Fetching all users via stored procedure...`);
    
    const rows = await callProcedure(authPool, "sp_get_users", []);
    
    console.log(`✅ Fetched ${rows.length} users`);
    return rows;
  } catch (err) {
    console.error(`❌ Error fetching users:`, err.message);
    throw err;
  }
};

/**
 * Get a single user by username with full details
 * @param {string} username - Username to look up
 * @returns {Object|null} User object or null if not found
 */
exports.getUserByUsername = async (username) => {
  try {
    console.log(`📋 Fetching user via stored procedure: ${username}`);
    
    const rows = await callProcedure(authPool, "sp_get_user_by_username", [username]);
    
    if (!rows || rows.length === 0) {
      console.log(`⚠ User not found: ${username}`);
      return null;
    }

    console.log(`✅ Fetched user: ${username}`);
    return rows[0];
  } catch (err) {
    console.error(`❌ Error fetching user ${username}:`, err.message);
    throw err;
  }
};

/**
 * Update user status (ACTIVE, INACTIVE, SUSPENDED)
 * @param {string} username - Username to update
 * @param {string} newStatus - New status value
 * @param {string} updatedBy - Username of admin making the change
 * @returns {Object} { success: boolean, message: string }
 */
exports.updateUserStatus = async (username, newStatus, updatedBy) => {
  try {
    console.log(`🔄 Updating user status via stored procedure: ${username} -> ${newStatus}`);
    
    const result = await authPool.query(
      `CALL sp_update_user_status(?, ?, ?, @p_success, @p_message)`,
      [username, newStatus, updatedBy]
    );

    // Fetch the OUT parameters
    const [outParams] = await authPool.query(
      `SELECT @p_success as success, @p_message as message`
    );

    const { success, message } = outParams[0];

    if (!success) {
      throw new Error(message);
    }

    console.log(`✅ User status updated: ${username} -> ${newStatus}`);
    return { success: true, message };
  } catch (err) {
    console.error(`❌ Error updating user status for ${username}:`, err.message);
    throw err;
  }
};

/**
 * Delete (soft delete) a user by marking as INACTIVE
 * @param {string} username - Username to delete
 * @param {string} deletedBy - Username of admin performing deletion
 * @returns {Object} { success: boolean, message: string }
 */
exports.deleteUser = async (username, deletedBy) => {
  try {
    console.log(`🗑️ Deleting user via stored procedure: ${username}`);
    
    const result = await authPool.query(
      `CALL sp_delete_user(?, ?, @p_success, @p_message)`,
      [username, deletedBy]
    );

    // Fetch the OUT parameters
    const [outParams] = await authPool.query(
      `SELECT @p_success as success, @p_message as message`
    );

    const { success, message } = outParams[0];

    if (!success) {
      throw new Error(message);
    }

    console.log(`✅ User deleted (soft): ${username}`);
    return { success: true, message };
  } catch (err) {
    console.error(`❌ Error deleting user ${username}:`, err.message);
    throw err;
  }
};
