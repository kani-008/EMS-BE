DROP FUNCTION IF EXISTS sp_get_department_id_by_name(VARCHAR);
CREATE OR REPLACE FUNCTION sp_get_department_id_by_name(p_department_name VARCHAR)
RETURNS TABLE(department_id INT, department_name VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT d.department_id, d.department_name FROM department d
  WHERE d.department_name = p_department_name
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
