-- Function: sp_get_credentials_role_name
-- Purpose: Resolve a role_id to a role_name using THIS database's table_role
--          table. table_role only holds R08=ADMIN (the one role that has no
--          row in event_management.user_role). Used as the fallback step of
--          the new DB-driven role resolution that replaces the old hardcoded
--          ROLE_MAP (see MIGRATION_NOTES.md).
-- Database: credentials
-- Node call:  SELECT * FROM sp_get_credentials_role_name($1);

DROP FUNCTION IF EXISTS sp_get_credentials_role_name(VARCHAR);

CREATE OR REPLACE FUNCTION sp_get_credentials_role_name(p_role_id VARCHAR)
RETURNS TABLE(role_id VARCHAR, role_name VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT tr.role_id, tr.role_name
  FROM table_role tr
  WHERE tr.role_id = p_role_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
