-- Function: sp_login_user
-- Purpose: Fetch login credentials + role info for authentication.
-- Database: credentials
-- Node call:  SELECT * FROM sp_login_user($1);

DROP FUNCTION IF EXISTS sp_login_user(VARCHAR);

CREATE OR REPLACE FUNCTION sp_login_user(p_user_name VARCHAR)
RETURNS TABLE(
  user_name       VARCHAR,
  password        VARCHAR,
  user_role_id    VARCHAR,
  department_id   INT,
  status          VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT tl.user_name, tl.password, tl.user_role_id, tl.department_id, tl.status
  FROM table_login tl
  WHERE tl.user_name = p_user_name
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
