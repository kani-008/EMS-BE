-- Function: sp_get_advisor_context
-- Purpose: Fetch advisor's department, batch, current_year, course, and a
--          dynamically-derived study_year/semester. Nothing is stored
--          statically — it's computed from CURRENT_DATE every call, same as
--          the original.
-- Database: event_management
-- Node call:  SELECT * FROM sp_get_advisor_context($1);

DROP FUNCTION IF EXISTS sp_get_advisor_context(VARCHAR);

CREATE OR REPLACE FUNCTION sp_get_advisor_context(p_advisor_username VARCHAR)
RETURNS TABLE(
  department_id     INT,
  department_name   VARCHAR,
  batch             VARCHAR,
  current_year      INT,
  course            VARCHAR,
  study_year        INT,
  derived_semester  INT
) AS $$
DECLARE
  v_batch             VARCHAR;
  v_course            VARCHAR;
  v_course_duration   INT := 4;
  v_years_completed   INT;
  v_derived_semester  INT;
BEGIN
  SELECT uf.batch, uf.course INTO v_batch, v_course
  FROM user_faculty uf
  WHERE uf.user_name = p_advisor_username
  LIMIT 1;

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'Advisor context not found';
  END IF;

  v_course_duration := CASE WHEN UPPER(TRIM(v_course)) = 'M.E' THEN 2 ELSE 4 END;
  v_years_completed := EXTRACT(YEAR FROM CURRENT_DATE)::INT - v_batch::INT;

  IF EXTRACT(MONTH FROM CURRENT_DATE)::INT >= 7 THEN
    v_derived_semester := (v_years_completed * 2) + 1;
  ELSE
    v_derived_semester := v_years_completed * 2;
  END IF;

  IF v_derived_semester < 1 THEN
    RAISE EXCEPTION 'Batch not yet started';
  END IF;

  IF v_derived_semester > (v_course_duration * 2) THEN
    RAISE EXCEPTION 'Batch passed out';
  END IF;

  RETURN QUERY
  SELECT
    uf.department_id,
    d.department_name,
    uf.batch,
    uf.current_year,
    uf.course,
    (EXTRACT(YEAR FROM CURRENT_DATE)::INT - uf.batch::INT),
    v_derived_semester
  FROM user_faculty uf
  INNER JOIN department d ON uf.department_id = d.department_id
  WHERE uf.user_name = p_advisor_username
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
