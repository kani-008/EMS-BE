-- Function: sp_rollback_login
-- Purpose: Delete a single login row during distributed-rollback handling
--          (e.g. when the event_management insert failed after this DB's
--          insert already succeeded).
-- NOTE: this procedure was called from admin.service.js in the original repo
-- but did not actually exist under db/procedures/ — it's added here for real.
-- Database: credentials
-- Node call:  SELECT * FROM sp_rollback_login($1);

DROP FUNCTION IF EXISTS credentials.sp_rollback_login(VARCHAR);

CREATE OR REPLACE FUNCTION credentials.sp_rollback_login(p_username VARCHAR)
RETURNS TABLE(deleted INT) AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM table_login WHERE user_name = p_username;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
