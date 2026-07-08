-- db/procedures/sp_login_user.sql
-- Stored Procedure: sp_login_user(p_user_name)
-- Purpose: Fetch login credentials and role info for authentication.
-- Database: credentials
-- Table: table_login
-- Called by: backend/src/services/auth.service.js → authPool

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_login_user`$$
CREATE PROCEDURE `sp_login_user`(IN p_user_name VARCHAR(255))
BEGIN
  SELECT
    `user_name`,
    `password`,
    `user_role_id`,
    `department_id`,
    `status`
  FROM `table_login`
  WHERE `user_name` = p_user_name
  LIMIT 1;
END$$

DELIMITER ;
