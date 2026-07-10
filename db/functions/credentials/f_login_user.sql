-- Function: sp_login_user
-- Purpose: Fetch login credentials + resolved role name for authentication,
--          in one query.
-- IMPROVEMENT: now that credentials/event_management are schemas in one
-- database, role name is resolved here directly (LEFT JOIN to
-- event_management.user_role, falling back to credentials.table_role for
-- ADMIN/R08) instead of auth.service.js needing a second round trip after
-- login.
-- Database: credentials
-- Node call:  SELECT * FROM sp_login_user($1);

DROP FUNCTION IF EXISTS credentials.sp_login_user(VARCHAR);

CREATE OR REPLACE FUNCTION credentials.sp_login_user(p_user_name VARCHAR)
RETURNS TABLE(
  user_name            VARCHAR,
  password             VARCHAR,
  user_role_id         VARCHAR,
  department_id        INT,
  status               VARCHAR,
  role_name            VARCHAR,
  must_change_password BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tl.user_name, tl.password, tl.user_role_id, tl.department_id, tl.status,
    COALESCE(ur.user_role, tr.role_name, 'UNKNOWN') AS role_name,
    tl.must_change_password
  FROM credentials.table_login tl
  LEFT JOIN event_management.user_role ur ON tl.user_role_id = ur.user_role_id
  LEFT JOIN credentials.table_role tr     ON tl.user_role_id = tr.role_id
  WHERE tl.user_name = p_user_name
  LIMIT 1;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
