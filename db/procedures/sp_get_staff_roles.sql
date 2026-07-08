-- db/procedures/sp_get_staff_roles.sql
-- Stored Procedure: sp_get_staff_roles
-- Purpose: Return all staff-eligible roles (excludes STUDENT) for frontend dropdowns.
--          No hardcoded role lists in frontend — data comes from DB.
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → getStaffRolesService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_staff_roles`$$
CREATE PROCEDURE `sp_get_staff_roles`()
BEGIN
  SELECT
    `user_role_id`,
    `user_role`
  FROM `user_role`
  WHERE UPPER(`user_role`) != 'STUDENT'
  ORDER BY `user_role` ASC;
END$$

DELIMITER ;
