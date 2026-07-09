DROP FUNCTION IF EXISTS event_management.sp_get_departments();
CREATE OR REPLACE FUNCTION event_management.sp_get_departments()
RETURNS TABLE(department_id INT, department_name VARCHAR) AS $$
BEGIN
  RETURN QUERY SELECT d.department_id, d.department_name FROM department d ORDER BY d.department_name ASC;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
