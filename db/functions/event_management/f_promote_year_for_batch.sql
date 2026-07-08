-- Function: sp_promote_year_for_batch
-- Purpose: Promote all ACTIVE students of a batch by 1 year, or mark them
--          INACTIVE if they've completed their course.
-- Database: event_management
-- Node call:  SELECT * FROM sp_promote_year_for_batch($1,$2);

DROP FUNCTION IF EXISTS sp_promote_year_for_batch(VARCHAR,VARCHAR);

CREATE OR REPLACE FUNCTION sp_promote_year_for_batch(
  p_batch           VARCHAR,
  p_department_name VARCHAR,
  OUT p_success        BOOLEAN,
  OUT p_message        VARCHAR,
  OUT p_affected_count INT
) AS $$
DECLARE
  v_table_name      VARCHAR;
  v_exists          BOOLEAN;
  v_course          VARCHAR;
  v_course_duration INT := 4;
  v_max_year        INT;
BEGIN
  v_table_name := 'user_student_' || LOWER(REGEXP_REPLACE(p_department_name, '[^A-Za-z0-9]', '', 'g'));

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table_name
  ) INTO v_exists;
  IF NOT v_exists THEN
    p_success := FALSE; p_message := 'Student table not found'; p_affected_count := 0; RETURN;
  END IF;

  SELECT DISTINCT uf.course INTO v_course
  FROM user_faculty uf
  INNER JOIN department d ON uf.department_id = d.department_id
  WHERE uf.batch = p_batch AND UPPER(d.department_name) = UPPER(p_department_name)
  LIMIT 1;

  v_course := COALESCE(v_course, 'B.E');
  v_course_duration := CASE WHEN v_course = 'M.E' THEN 2 ELSE 4 END;

  EXECUTE format(
    'SELECT COALESCE(MAX(current_year), 0) FROM %I WHERE status = ''ACTIVE'' AND batch = $1',
    v_table_name
  ) INTO v_max_year USING p_batch;

  IF v_max_year = 0 THEN
    p_success := TRUE; p_message := 'No active students found in the table'; p_affected_count := 0; RETURN;
  END IF;

  IF v_max_year + 1 > v_course_duration THEN
    EXECUTE format('UPDATE %I SET status = ''INACTIVE'' WHERE status = ''ACTIVE'' AND batch = $1', v_table_name)
      USING p_batch;
    GET DIAGNOSTICS p_affected_count = ROW_COUNT;
    p_message := 'Batch passed out — students deactivated';
  ELSE
    EXECUTE format('UPDATE %I SET current_year = current_year + 1 WHERE status = ''ACTIVE'' AND batch = $1', v_table_name)
      USING p_batch;
    GET DIAGNOSTICS p_affected_count = ROW_COUNT;
    p_message := format('Promoted to year %s', v_max_year + 1);
  END IF;

  p_success := TRUE;
EXCEPTION WHEN OTHERS THEN
  p_success := FALSE; p_message := SQLERRM; p_affected_count := 0;
END;
$$ LANGUAGE plpgsql;
