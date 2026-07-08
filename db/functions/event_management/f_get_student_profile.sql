-- Function: sp_get_student_profile
-- Purpose: Find a student's profile by scanning all user_student_% tables.
-- Database: event_management
-- Node call:  SELECT * FROM sp_get_student_profile($1);

DROP FUNCTION IF EXISTS sp_get_student_profile(VARCHAR);

CREATE OR REPLACE FUNCTION sp_get_student_profile(p_username VARCHAR)
RETURNS TABLE(
  roll_no VARCHAR, user_name VARCHAR, first_name VARCHAR, last_name VARCHAR, gender VARCHAR,
  registration_no VARCHAR, course VARCHAR, current_year INT, semester INT, batch VARCHAR,
  department_name VARCHAR, academic_year_id VARCHAR, status VARCHAR, created_on TIMESTAMP,
  last_updated_by VARCHAR
) AS $$
DECLARE
  v_table RECORD;
  v_found INT;
BEGIN
  FOR v_table IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'user\_student\_%'
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE user_name = $1', v_table.table_name)
      INTO v_found USING p_username;

    IF v_found > 0 THEN
      RETURN QUERY EXECUTE format(
        'SELECT s.roll_no, s.user_name, s.first_name, s.last_name, s.gender,
                s.registration_no, s.course, s.current_year, s.semester, s.batch,
                d.department_name, s.academic_year_id, s.status, s.created_on, s.last_updated_by
         FROM %I s
         LEFT JOIN department d ON s.department_id = d.department_id
         WHERE s.user_name = $1 LIMIT 1',
        v_table.table_name
      ) USING p_username;
      RETURN;
    END IF;
  END LOOP;

  RETURN;
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$ LANGUAGE plpgsql;
