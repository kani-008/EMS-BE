-- db/procedures/sp_get_user_by_username.sql
-- Stored Procedure: sp_get_user_by_username
-- Purpose: Fetch detailed user information by username
-- Called by: admin.service.js getUserDetailsService
-- Returns: Full user profile with role and department info

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_user_by_username`$$
CREATE PROCEDURE `sp_get_user_by_username`(
  IN p_username VARCHAR(255)
)
BEGIN
  SELECT
    tl.user_name,
    tl.status,
    tl.user_role_id,
    ur.user_role,
    tl.department_id,
    d.department_name,
    tl.last_updated_by,
    tl.last_updated_on
  FROM table_login tl
  INNER JOIN user_role ur ON tl.user_role_id = ur.user_role_id
  INNER JOIN department d ON tl.department_id = d.department_id
  WHERE tl.user_name = p_username
  LIMIT 1;
END$$

DELIMITER ;
