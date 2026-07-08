DROP FUNCTION IF EXISTS sp_get_role_id_by_name(VARCHAR);
CREATE OR REPLACE FUNCTION sp_get_role_id_by_name(p_role_name VARCHAR)
RETURNS TABLE(user_role_id VARCHAR, user_role VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT ur.user_role_id, ur.user_role FROM user_role ur
  WHERE UPPER(ur.user_role) = UPPER(p_role_name)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
