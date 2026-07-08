-- db/procedures/sp_get_department_id_by_name.sql
-- Stored Procedure: sp_get_department_id_by_name(p_department_name)
-- Purpose: Fetch department_id for a given department name from event_management database
-- Database: event_management

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_department_id_by_name`$$
CREATE PROCEDURE `sp_get_department_id_by_name`(IN p_department_name VARCHAR(255))
BEGIN
  SELECT
    department_id,
    department_name
  FROM `department`
  WHERE `department_name` = p_department_name
  LIMIT 1;
END$$

DELIMITER ;
