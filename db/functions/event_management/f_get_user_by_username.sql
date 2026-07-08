DROP FUNCTION IF EXISTS sp_get_user_by_username(VARCHAR);
CREATE OR REPLACE FUNCTION sp_get_user_by_username(p_username VARCHAR)
RETURNS TABLE(
  user_name VARCHAR, status VARCHAR, user_role_id VARCHAR, user_role VARCHAR,
  department_id INT, department_name VARCHAR, last_updated_by VARCHAR, last_updated_on TIMESTAMP
) AS $$
BEGIN
  -- NOTE: original MySQL joined table_login (credentials DB) directly here.
  -- That's a cross-database join, not possible in Postgres. This function
  -- now only resolves role/department info from event_management; the
  -- caller must merge in status from credentials.table_login separately
  -- (the service layer already does this pattern elsewhere).
  RETURN QUERY
  SELECT
    p_username, NULL::VARCHAR, uf.user_role_id, ur.user_role,
    uf.department_id, d.department_name, uf.last_updated_by, uf.last_updated_on
  FROM user_faculty uf
  INNER JOIN user_role ur ON uf.user_role_id = ur.user_role_id
  INNER JOIN department d ON uf.department_id = d.department_id
  WHERE uf.user_name = p_username
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
