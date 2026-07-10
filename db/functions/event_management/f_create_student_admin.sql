-- Function: sp_create_student_user_admin
-- Purpose: Insert a student into the department's dynamic table
--          user_student_<dept>, with parameters explicitly provided.
-- Database: event_management
-- Node call:  SELECT * FROM sp_create_student_user_admin($1,...,$13);

DROP FUNCTION IF EXISTS event_management.sp_create_student_user_admin(VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,INT,VARCHAR,INT,VARCHAR,INT,VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_create_student_user_admin(
  p_roll_no          VARCHAR,
  p_user_name        VARCHAR,
  p_first_name       VARCHAR,
  p_last_name        VARCHAR,
  p_gender           VARCHAR,
  p_registration_no  VARCHAR,
  p_academic_year_id VARCHAR,
  p_current_year     INT,
  p_course           VARCHAR,
  p_semester         INT,
  p_batch            VARCHAR,
  p_department_id    INT,
  p_created_by       VARCHAR,
  OUT p_success    BOOLEAN,
  OUT p_message    VARCHAR,
  OUT p_username   VARCHAR,
  OUT p_table_name VARCHAR
) AS $$
DECLARE
  v_dept_name  VARCHAR;
  v_table_name VARCHAR;
BEGIN
  SELECT LOWER(department_name) INTO v_dept_name FROM event_management.department WHERE department_id = p_department_id LIMIT 1;
  IF v_dept_name IS NULL THEN
    RAISE EXCEPTION 'Department name could not be resolved. Check department table.';
  END IF;

  -- Ensure the department's student table exists (idempotent).
  SELECT table_name INTO v_table_name FROM event_management.sp_ensure_student_table(v_dept_name);

  EXECUTE format(
    'INSERT INTO event_management.%I (roll_no, user_name, first_name, last_name, gender, registration_no,
                     academic_year_id, department_id, current_year, course, semester, batch, last_updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (roll_no) DO NOTHING',
    v_table_name
  ) USING p_roll_no, p_user_name, COALESCE(p_first_name, ''), COALESCE(p_last_name, ''),
          COALESCE(p_gender, ''), COALESCE(p_registration_no, ''), p_academic_year_id,
          p_department_id, p_current_year, p_course, p_semester, p_batch, p_created_by;

  p_success := TRUE;
  p_message := format('Student created: %s in %s', p_user_name, v_table_name);
  p_username := p_user_name;
  p_table_name := v_table_name;
EXCEPTION WHEN OTHERS THEN
  p_success := FALSE;
  p_message := SQLERRM;
  p_username := NULL;
  p_table_name := NULL;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
