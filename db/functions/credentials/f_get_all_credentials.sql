-- Function: sp_get_all_credentials
-- Purpose: Return all login rows with their role name resolved.
-- RESTORED to a real join: now that credentials and event_management are
-- two schemas in the SAME Supabase database (rather than two separate
-- Postgres databases), this can join straight across schemas exactly like
-- the original MySQL procedure did (MySQL's cross-database joins on one
-- server behave the same way Postgres cross-schema joins on one database
-- do). The app-layer workaround this function used in the two-database
-- version of this migration is no longer needed.
-- Database: credentials
-- Node call:  SELECT * FROM sp_get_all_credentials();

DROP FUNCTION IF EXISTS credentials.sp_get_all_credentials();

CREATE OR REPLACE FUNCTION credentials.sp_get_all_credentials()
RETURNS TABLE(
  user_name        VARCHAR,
  password         VARCHAR,
  status           VARCHAR,
  user_role_id     VARCHAR,
  department_id    INT,
  last_updated_on  TIMESTAMP,
  user_role_name   VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tl.user_name, tl.password, tl.status, tl.user_role_id, tl.department_id, tl.last_updated_on,
    COALESCE(ur.user_role, tr.role_name) AS user_role_name
  FROM credentials.table_login tl
  LEFT JOIN event_management.user_role ur ON tl.user_role_id = ur.user_role_id
  LEFT JOIN credentials.table_role tr     ON tl.user_role_id = tr.role_id   -- covers ADMIN (R08)
  ORDER BY tl.last_updated_on DESC;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
