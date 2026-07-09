-- Function: sp_rollback_logins
-- Purpose: Delete multiple login rows in one call (comma-separated usernames)
--          during distributed-rollback handling in createUsersService.
-- NOTE: like sp_rollback_login, this was called by admin.service.js but did
-- not exist in db/procedures/ in the original repo — added here for real.
-- Database: credentials
-- Node call:  SELECT * FROM sp_rollback_logins($1);   -- $1 = 'user1,user2,...'

DROP FUNCTION IF EXISTS credentials.sp_rollback_logins(TEXT);

CREATE OR REPLACE FUNCTION credentials.sp_rollback_logins(p_usernames TEXT)
RETURNS TABLE(deleted INT) AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM table_login
  WHERE user_name = ANY(string_to_array(p_usernames, ','));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
