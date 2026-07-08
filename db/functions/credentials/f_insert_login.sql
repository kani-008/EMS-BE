-- Function: sp_insert_login
-- Purpose: Insert a new login row. If the username already exists, its data
--          is refreshed (matches the old ON DUPLICATE KEY UPDATE behaviour)
--          but `inserted` comes back 0 so callers can tell it wasn't new.
-- Database: credentials
-- Node call:  SELECT * FROM sp_insert_login($1,$2,$3,$4,$5,$6);

DROP FUNCTION IF EXISTS sp_insert_login(VARCHAR, VARCHAR, VARCHAR, INT, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION sp_insert_login(
  p_username      VARCHAR,
  p_password      VARCHAR,
  p_role_id       VARCHAR,
  p_department_id INT,
  p_status        VARCHAR,
  p_created_by    VARCHAR
)
RETURNS TABLE(inserted INT) AS $$
DECLARE
  v_existed BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM table_login WHERE user_name = p_username) INTO v_existed;

  IF v_existed THEN
    UPDATE table_login SET
      password        = p_password,
      user_role_id    = p_role_id,
      department_id   = p_department_id,
      status          = p_status,
      last_updated_by = p_created_by
    WHERE user_name = p_username;
  ELSE
    INSERT INTO table_login (user_name, password, user_role_id, department_id, status, last_updated_by)
    VALUES (p_username, p_password, p_role_id, p_department_id, p_status, p_created_by);
  END IF;

  RETURN QUERY SELECT CASE WHEN v_existed THEN 0 ELSE 1 END;
END;
$$ LANGUAGE plpgsql;
