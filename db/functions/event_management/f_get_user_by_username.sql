-- Function: sp_get_user_by_username
-- Purpose: Fetch detailed user information by username, including live
--          status from credentials.table_login.
-- RESTORED to a real join: this originally joined table_login (credentials)
-- directly in the same procedure in MySQL, which worked because MySQL's
-- cross-database joins on one server work like Postgres's cross-schema
-- joins on one database. Now that credentials/event_management are schemas
-- in one Supabase database rather than two separate Postgres databases,
-- the same direct join is possible again.
-- Database: event_management
-- Node call:  SELECT * FROM sp_get_user_by_username($1);

DROP FUNCTION IF EXISTS event_management.sp_get_user_by_username(VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_get_user_by_username(p_username VARCHAR)
RETURNS TABLE(
  user_name VARCHAR, status VARCHAR, user_role_id VARCHAR, user_role VARCHAR,
  department_id INT, department_name VARCHAR, last_updated_by VARCHAR, last_updated_on TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tl.user_name, tl.status, uf.user_role_id, ur.user_role,
    uf.department_id, d.department_name, uf.last_updated_by, uf.last_updated_on
  FROM credentials.table_login tl
  INNER JOIN event_management.user_faculty uf ON uf.user_name = tl.user_name
  INNER JOIN event_management.user_role ur    ON uf.user_role_id = ur.user_role_id
  INNER JOIN event_management.department d    ON uf.department_id = d.department_id
  WHERE tl.user_name = p_username
  LIMIT 1;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
