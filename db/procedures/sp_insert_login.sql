-- db/procedures/sp_insert_login.sql
-- Stored Procedure: sp_insert_login
-- Purpose: Insert a new user into table_login (credentials database)
-- Database: credentials

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_insert_login`$$
CREATE PROCEDURE `sp_insert_login`(
  IN p_username VARCHAR(255),
  IN p_password VARCHAR(255),
  IN p_role_id VARCHAR(50),
  IN p_department_id INT,
  IN p_status VARCHAR(50),
  IN p_created_by VARCHAR(255)
)
BEGIN
  DECLARE inserted_count INT DEFAULT 0;
  
  -- Attempt to insert the user
  INSERT INTO `table_login` 
    (user_name, password, user_role_id, department_id, status, last_updated_by)
  VALUES 
    (p_username, p_password, p_role_id, p_department_id, p_status, p_created_by)
  ON DUPLICATE KEY UPDATE
    password = p_password,
    user_role_id = p_role_id,
    department_id = p_department_id,
    status = p_status,
    last_updated_by = p_created_by;
  
  -- Return insertion status (1 if new record, 0 if updated existing)
  IF ROW_COUNT() > 0 THEN
    SET inserted_count = 1;
  END IF;
  
  SELECT inserted_count AS inserted;
END$$

DELIMITER ;
