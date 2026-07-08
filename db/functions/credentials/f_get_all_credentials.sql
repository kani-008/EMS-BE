-- Function: sp_get_all_credentials
-- Purpose: Return all login rows.
-- NOTE (Postgres architecture change): the original MySQL version joined
-- directly to `event_management`.`user_role` inside this procedure. Postgres
-- cannot join across two separate databases without an extension like
-- postgres_fdw/dblink. Since credentials and event_management are kept as
-- two separate Postgres databases (mirroring the original two-MySQL-DB
-- design), this function now returns the raw credentials rows only —
-- role-name resolution is done in the application layer (admin.service.js),
-- which already fetches user_role rows from the event_management pool
-- separately and joins them in JS.
-- Database: credentials
-- Node call:  SELECT * FROM sp_get_all_credentials();

DROP FUNCTION IF EXISTS sp_get_all_credentials();

CREATE OR REPLACE FUNCTION sp_get_all_credentials()
RETURNS TABLE(
  user_name       VARCHAR,
  password        VARCHAR,
  status          VARCHAR,
  user_role_id    VARCHAR,
  department_id   INT,
  last_updated_on TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT tl.user_name, tl.password, tl.status, tl.user_role_id, tl.department_id, tl.last_updated_on
  FROM table_login tl
  ORDER BY tl.last_updated_on DESC;
END;
$$ LANGUAGE plpgsql;
