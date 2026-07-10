-- Function: sp_get_all_users
-- Purpose: Return a unified list of all users, combining faculty/staff from
--          user_faculty with student profiles dynamically retrieved from
--          all department-specific student tables.
-- Database: event_management
-- Node call:  SELECT * FROM sp_get_all_users();

DROP FUNCTION IF EXISTS event_management.sp_get_all_users();

CREATE OR REPLACE FUNCTION event_management.sp_get_all_users()
RETURNS TABLE(
  faculty_id VARCHAR,
  roll_no    VARCHAR,
  first_name VARCHAR,
  last_name  VARCHAR,
  user_name  VARCHAR,
  gender     VARCHAR,
  department_name VARCHAR,
  user_role_id    VARCHAR,
  user_role       VARCHAR,
  batch      VARCHAR,
  course     VARCHAR,
  current_year    INT,
  created_on TIMESTAMP,
  last_updated_by VARCHAR
) AS $$
DECLARE
  r_dept RECORD;
  v_table_name VARCHAR;
  v_query VARCHAR := '';
  v_exists BOOLEAN;
BEGIN
  -- First, get all faculty/staff members
  v_query := 'SELECT uf.faculty_id, NULL::VARCHAR AS roll_no, uf.first_name, uf.last_name, uf.user_name, uf.gender, ' ||
             'd.department_name, uf.user_role_id, ur.user_role, uf.batch, uf.course, ' ||
             'uf.current_year, uf.created_on, uf.last_updated_by ' ||
             'FROM event_management.user_faculty uf ' ||
             'LEFT JOIN event_management.department d ON uf.department_id = d.department_id ' ||
             'LEFT JOIN event_management.user_role ur ON uf.user_role_id = ur.user_role_id';

  -- Loop through all departments and union their student tables
  FOR r_dept IN SELECT d.department_name, d.department_id FROM event_management.department d LOOP
    v_table_name := 'user_student_' || LOWER(REGEXP_REPLACE(r_dept.department_name, '[^A-Za-z0-9]', '', 'g'));
    
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'event_management' AND table_name = v_table_name
    ) INTO v_exists;

    IF v_exists THEN
      v_query := v_query || ' UNION ALL ' ||
                 'SELECT NULL::VARCHAR AS faculty_id, s.roll_no AS roll_no, s.first_name, s.last_name, s.user_name, s.gender, ' ||
                 'd.department_name, ''R01''::VARCHAR AS user_role_id, ''STUDENT''::VARCHAR AS user_role, s.batch, s.course, ' ||
                 's.current_year, s.created_on, s.last_updated_by ' ||
                 'FROM event_management.' || quote_ident(v_table_name) || ' s ' ||
                 'LEFT JOIN event_management.department d ON s.department_id = d.department_id';
    END IF;
  END LOOP;

  v_query := v_query || ' ORDER BY created_on DESC';

  RETURN QUERY EXECUTE v_query;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
