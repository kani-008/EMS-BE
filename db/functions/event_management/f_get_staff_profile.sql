DROP FUNCTION IF EXISTS event_management.sp_get_staff_profile(VARCHAR);
CREATE OR REPLACE FUNCTION event_management.sp_get_staff_profile(p_username VARCHAR)
RETURNS TABLE(
  faculty_id VARCHAR, user_name VARCHAR, first_name VARCHAR, last_name VARCHAR,
  gender VARCHAR, contact VARCHAR, department_id INT, department_name VARCHAR,
  user_role_id VARCHAR, user_role VARCHAR, batch VARCHAR, course VARCHAR,
  current_year INT, user_profile VARCHAR, created_on TIMESTAMP, last_updated_by VARCHAR,
  academic_year_id VARCHAR, academic_year VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    uf.faculty_id, uf.user_name, uf.first_name, uf.last_name, uf.gender, uf.contact,
    uf.department_id, d.department_name, uf.user_role_id, ur.user_role, uf.batch, uf.course,
    uf.current_year, uf.user_profile, uf.created_on, uf.last_updated_by,
    ay.academic_year_id, ay.academic_year
  FROM user_faculty uf
  LEFT JOIN department d ON uf.department_id = d.department_id
  LEFT JOIN user_role ur ON uf.user_role_id = ur.user_role_id
  LEFT JOIN academic_year ay ON ay.academic_year_id = ('AY' || uf.batch)
  WHERE uf.user_name = p_username
  LIMIT 1;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
