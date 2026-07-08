DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_all_credentials`$$

CREATE PROCEDURE `sp_get_all_credentials`()
BEGIN
  SELECT
    tl.user_name,
    tl.password,
    tl.status,
    tl.user_role_id,
    tl.department_id,
    tl.last_updated_on,
    ur.user_role AS user_role_name
  FROM `table_login` tl
  LEFT JOIN `event_management`.`user_role` ur 
    ON tl.user_role_id = ur.user_role_id
  ORDER BY tl.last_updated_on DESC;
END$$

DELIMITER ;