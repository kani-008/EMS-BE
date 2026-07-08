DROP FUNCTION IF EXISTS sp_get_departments();
CREATE OR REPLACE FUNCTION sp_get_departments()
RETURNS TABLE(department_id INT, department_name VARCHAR) AS $$
BEGIN
  RETURN QUERY SELECT d.department_id, d.department_name FROM department d ORDER BY d.department_name ASC;
END;
$$ LANGUAGE plpgsql;
