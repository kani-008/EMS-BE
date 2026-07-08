DROP FUNCTION IF EXISTS sp_get_academic_year_by_batch(VARCHAR);
CREATE OR REPLACE FUNCTION sp_get_academic_year_by_batch(p_batch VARCHAR)
RETURNS TABLE(academic_year_id VARCHAR, academic_year VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT ay.academic_year_id, ay.academic_year FROM academic_year ay
  WHERE ay.academic_year_id = ('AY' || p_batch)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
