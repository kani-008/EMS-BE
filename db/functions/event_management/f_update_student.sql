-- Function: sp_update_student
-- Purpose: Update a student's details in their department's table.
-- Database: event_management
-- Node call:  SELECT * FROM sp_update_student($1,...,$7);

DROP FUNCTION IF EXISTS sp_update_student(VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR);

CREATE OR REPLACE FUNCTION sp_update_student(
  p_advisor_username VARCHAR,
  p_roll_no          VARCHAR,
  p_first_name       VARCHAR,
  p_last_name        VARCHAR,
  p_gender           VARCHAR,
  p_registration_no  VARCHAR,
  p_course           VARCHAR,
  OUT p_success BOOLEAN,
  OUT p_message VARCHAR
) AS $$
DECLARE
  v_dept_name    VARCHAR;
  v_batch        VARCHAR;
  v_table_name   VARCHAR;
  v_exists       BOOLEAN;
  v_student_cnt  INT;
BEGIN
  SELECT d.department_name, uf.batch INTO v_dept_name, v_batch
  FROM user_faculty uf
  INNER JOIN department d ON uf.department_id = d.department_id
  WHERE uf.user_name = p_advisor_username
  LIMIT 1;

  IF v_dept_name IS NULL OR v_batch IS NULL THEN
    p_success := FALSE; p_message := 'Advisor context not found'; RETURN;
  END IF;

  v_table_name := 'user_student_' || LOWER(REGEXP_REPLACE(v_dept_name, '[^A-Za-z0-9]', '', 'g'));

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table_name
  ) INTO v_exists;
  IF NOT v_exists THEN
    p_success := FALSE; p_message := 'Student table does not exist'; RETURN;
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM %I WHERE roll_no = $1 AND batch = $2', v_table_name)
    INTO v_student_cnt USING p_roll_no, v_batch;

  IF v_student_cnt = 0 THEN
    p_success := FALSE; p_message := 'Student not found in your assigned batch'; RETURN;
  END IF;

  EXECUTE format(
    'UPDATE %I SET first_name=$1, last_name=$2, gender=$3, registration_no=$4, course=$5, last_updated_by=$6
     WHERE roll_no = $7',
    v_table_name
  ) USING p_first_name, p_last_name, p_gender, p_registration_no, p_course, p_advisor_username, p_roll_no;

  p_success := TRUE;
  p_message := 'Student updated successfully';
EXCEPTION WHEN OTHERS THEN
  p_success := FALSE; p_message := SQLERRM;
END;
$$ LANGUAGE plpgsql;
