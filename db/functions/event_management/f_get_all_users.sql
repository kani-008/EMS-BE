DROP FUNCTION IF EXISTS sp_get_all_users();
CREATE OR REPLACE FUNCTION sp_get_all_users()
RETURNS TABLE(
  faculty_id VARCHAR, first_name VARCHAR, last_name VARCHAR, user_name VARCHAR,
  gender VARCHAR, department_name VARCHAR, user_role_id VARCHAR, user_role VARCHAR,
  batch VARCHAR, course VARCHAR, current_year INT, created_on TIMESTAMP, last_updated_by VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT uf.faculty_id, uf.first_name, uf.last_name, uf.user_name, uf.gender,
         d.department_name, uf.user_role_id, ur.user_role, uf.batch, uf.course,
         uf.current_year, uf.created_on, uf.last_updated_by
  FROM user_faculty uf
  LEFT JOIN department d ON uf.department_id = d.department_id
  LEFT JOIN user_role ur ON uf.user_role_id = ur.user_role_id
  ORDER BY uf.created_on DESC;
END;
$$ LANGUAGE plpgsql;
