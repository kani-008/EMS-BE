DROP FUNCTION IF EXISTS event_management.sp_get_staff_roles();
CREATE OR REPLACE FUNCTION event_management.sp_get_staff_roles()
RETURNS TABLE(user_role_id VARCHAR, user_role VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT ur.user_role_id, ur.user_role FROM user_role ur
  WHERE UPPER(ur.user_role) != 'STUDENT'
  ORDER BY ur.user_role ASC;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
