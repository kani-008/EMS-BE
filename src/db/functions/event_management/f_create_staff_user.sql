-- Function: sp_create_staff_user
-- Purpose: Create a staff user with an explicit username and auto-generated
--          FAC### id. Validates role + department.
-- Database: event_management
-- Node call:  SELECT * FROM sp_create_staff_user($1,...,$10);

DROP FUNCTION IF EXISTS event_management.sp_create_staff_user(VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR,INT,VARCHAR,INT,VARCHAR,VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_create_staff_user(
  p_username      VARCHAR,
  p_first_name    VARCHAR,
  p_last_name     VARCHAR,
  p_gender        VARCHAR,
  p_role_name     VARCHAR,
  p_department_id INT,
  p_batch         VARCHAR,
  p_current_year  INT,
  p_course        VARCHAR,
  p_created_by    VARCHAR,
  OUT p_success    BOOLEAN,
  OUT p_message    VARCHAR,
  OUT p_faculty_id VARCHAR,
  OUT p_role_id    VARCHAR
) AS $$
DECLARE
  v_dept_count  INT;
  v_uname_count INT;
  v_max_seq     INT;
  v_next_seq    INT;
  v_fac_id      VARCHAR;
  v_batch       VARCHAR;
  v_course      VARCHAR;
BEGIN
  SELECT ur.user_role_id INTO p_role_id FROM user_role ur WHERE UPPER(ur.user_role) = UPPER(p_role_name) LIMIT 1;
  IF p_role_id IS NULL THEN
    p_success := FALSE; p_message := format('Invalid role: "%s". Check user_role table.', p_role_name);
    p_faculty_id := NULL; RETURN;
  END IF;

  IF p_department_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dept_count FROM department WHERE department_id = p_department_id;
    IF v_dept_count = 0 THEN
      p_success := FALSE; p_message := format('Department not found: id=%s', p_department_id);
      p_faculty_id := NULL; RETURN;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_uname_count FROM user_faculty WHERE user_name = p_username;
  IF v_uname_count > 0 THEN
    p_success := FALSE; p_message := format('Staff username already exists: "%s"', p_username);
    p_faculty_id := NULL; RETURN;
  END IF;

  SELECT COALESCE(MAX((SUBSTRING(faculty_id FROM 4))::INT), 100) INTO v_max_seq
  FROM user_faculty WHERE faculty_id ~ '^FAC[0-9]+$';

  v_next_seq := GREATEST(v_max_seq + 1, 101);
  v_fac_id := 'FAC' || LPAD(v_next_seq::TEXT, 3, '0');
  WHILE EXISTS (SELECT 1 FROM user_faculty WHERE faculty_id = v_fac_id) LOOP
    v_next_seq := v_next_seq + 1;
    v_fac_id := 'FAC' || LPAD(v_next_seq::TEXT, 3, '0');
  END LOOP;

  v_batch  := CASE WHEN p_batch IS NULL OR TRIM(p_batch) = '' OR p_batch = 'N/A' THEN 'N/A' ELSE TRIM(p_batch) END;
  v_course := CASE WHEN p_course IS NULL OR TRIM(p_course) = '' THEN '-' ELSE TRIM(p_course) END;

  INSERT INTO user_faculty (
    faculty_id, user_name, first_name, last_name, gender,
    department_id, user_role_id, current_year, batch, course, last_updated_by
  ) VALUES (
    v_fac_id, p_username, p_first_name, COALESCE(p_last_name, ''), COALESCE(p_gender, ''),
    p_department_id, p_role_id, COALESCE(p_current_year, 0), v_batch, v_course, p_created_by
  );

  p_success := TRUE;
  p_message := format('Staff created successfully: %s (%s)', p_username, v_fac_id);
  p_faculty_id := v_fac_id;
EXCEPTION WHEN OTHERS THEN
  p_success := FALSE;
  p_message := SQLERRM;
  p_faculty_id := NULL;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
