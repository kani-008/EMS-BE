-- db/procedures/sp_get_departments.sql
-- Stored Procedure: sp_get_departments
-- Purpose: Return all departments for frontend dropdowns.
--          No hardcoded department lists in frontend — data comes from DB.
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → getDepartmentsService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_departments`$$
CREATE PROCEDURE `sp_get_departments`()
BEGIN
  SELECT
    `department_id`,
    `department_name`
  FROM `department`
  ORDER BY `department_name` ASC;
END$$

DELIMITER ;
