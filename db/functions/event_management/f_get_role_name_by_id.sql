-- Function: sp_get_role_name_by_id
-- Purpose: Resolve a role_id (e.g. 'R03') to its role name (e.g. 'ADVISOR').
-- NEW — this is the replacement for the hardcoded ROLE_MAP that lived in
-- auth.service.js AND auth.middleware.js and had R06/R08 swapped
-- (R06 was mapped to "ADMIN", R08 to "SPORTS" — backwards). Every role
-- except ADMIN (R08) lives in this table; ADMIN is resolved via
-- credentials.sp_get_credentials_role_name instead, since it only exists in
-- the credentials DB's table_role.
-- Database: event_management
-- Node call:  SELECT * FROM sp_get_role_name_by_id($1);

DROP FUNCTION IF EXISTS sp_get_role_name_by_id(VARCHAR);
CREATE OR REPLACE FUNCTION sp_get_role_name_by_id(p_role_id VARCHAR)
RETURNS TABLE(user_role_id VARCHAR, user_role VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT ur.user_role_id, ur.user_role FROM user_role ur
  WHERE ur.user_role_id = p_role_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
