USE event_management;

DROP PROCEDURE IF EXISTS sp_get_role_id_by_name;

DELIMITER $$
CREATE PROCEDURE sp_get_role_id_by_name(IN p_role_name VARCHAR(255))
BEGIN
  SELECT user_role_id, user_role
  FROM user_role
  WHERE UPPER(user_role) = UPPER(p_role_name)
  LIMIT 1;
END$$
DELIMITER ;