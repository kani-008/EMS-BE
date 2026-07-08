-- Function: sp_create_student_user
-- Purpose: Insert a student into the department's dynamic table
--          user_student_<dept>, enforcing that the advisor's own
--          department/batch match the student being created.
--
-- MERGE NOTE: the original repo had TWO procedures doing this same job —
--   sp_create_student_user (called from admin.service.js / createUsersService,
--     used by /api/admin/create-users) and
--   sp_create_student (called from modules/staff/staff.service.js,
--     used by /api/staff/... single/range/excel creation)
-- — targeting two different table-naming schemes, so students created by
-- one code path were invisible to the other. This migration merges them
-- into ONE function so both callers write to the exact same table.
-- Both admin.service.js and staff.service.js are updated to call this.
-- Database: event_management
-- Node call:  SELECT * FROM sp_create_student_user($1,...,$11);

DROP FUNCTION IF EXISTS event_management.sp_create_student_user(VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,INT,VARCHAR,VARCHAR,VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_create_student_user(
  p_advisor_username VARCHAR,
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
  p_created_by       VARCHAR,
  OUT p_success    BOOLEAN,
  OUT p_message    VARCHAR,
  OUT p_username   VARCHAR,
  OUT p_table_name VARCHAR
) AS $$
DECLARE
  v_advisor_dept  INT;
  v_advisor_batch VARCHAR;
  v_dept_name     VARCHAR;
  v_table_name    VARCHAR;
BEGIN
  SELECT department_id, batch INTO v_advisor_dept, v_advisor_batch
  FROM user_faculty WHERE user_name = p_advisor_username LIMIT 1;

  IF v_advisor_dept IS NULL THEN
    RAISE EXCEPTION 'Advisor not found in system. Only registered advisors can create students.';
  END IF;

  IF TRIM(v_advisor_batch) != TRIM(p_batch) THEN
    RAISE EXCEPTION 'Batch mismatch: student batch does not match advisor assigned batch.';
  END IF;

  SELECT LOWER(department_name) INTO v_dept_name FROM department WHERE department_id = v_advisor_dept LIMIT 1;
  IF v_dept_name IS NULL THEN
    RAISE EXCEPTION 'Department name could not be resolved. Check department table.';
  END IF;

  -- Ensure the department's student table exists (idempotent).
  SELECT table_name INTO v_table_name FROM sp_ensure_student_table(v_dept_name);

  EXECUTE format(
    'INSERT INTO %I (roll_no, user_name, first_name, last_name, gender, registration_no,
                     academic_year_id, department_id, current_year, course, semester, batch, last_updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (roll_no) DO NOTHING',
    v_table_name
  ) USING p_roll_no, p_user_name, COALESCE(p_first_name, ''), COALESCE(p_last_name, ''),
          COALESCE(p_gender, ''), COALESCE(p_registration_no, ''), p_academic_year_id,
          v_advisor_dept, p_current_year, p_course, p_semester, p_batch, p_created_by;

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
