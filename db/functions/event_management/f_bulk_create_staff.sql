-- Function: sp_bulk_create_staff
-- Purpose: Insert one staff row per call with an auto-generated username,
--          used by the Excel bulk-upload flow.
-- Database: event_management
-- Node call:  SELECT * FROM sp_bulk_create_staff($1,...,$9);

DROP FUNCTION IF EXISTS sp_bulk_create_staff(VARCHAR,VARCHAR,VARCHAR,VARCHAR,INT,VARCHAR,VARCHAR,INT,VARCHAR);

CREATE OR REPLACE FUNCTION sp_bulk_create_staff(
  p_first_name    VARCHAR,
  p_last_name     VARCHAR,
  p_gender        VARCHAR,
  p_role_name     VARCHAR,
  p_department_id INT,
  p_batch         VARCHAR,
  p_course        VARCHAR,
  p_current_year  INT,
  p_created_by    VARCHAR,
  OUT p_success    BOOLEAN,
  OUT p_message    VARCHAR,
  OUT p_username   VARCHAR,
  OUT p_faculty_id VARCHAR,
  OUT p_role_id    VARCHAR
) AS $$
DECLARE
  v_dept_count    INT;
  v_uname_count   INT;
  v_max_seq       INT;
  v_next_seq      INT;
  v_fac_id        VARCHAR;
  v_batch         VARCHAR;
  v_course        VARCHAR;
  v_current_year  INT;
  v_base_uname    VARCHAR;
  v_gen_uname     VARCHAR;
  v_suffix        INT := 0;
BEGIN
  v_base_uname := REGEXP_REPLACE(LOWER(p_first_name || COALESCE(p_last_name, '')), '[^a-z0-9]', '', 'g');

  IF LENGTH(v_base_uname) = 0 THEN
    p_success := FALSE; p_message := 'Cannot generate username from empty first_name and last_name';
    p_username := NULL; p_faculty_id := NULL; p_role_id := NULL; RETURN;
  END IF;

  v_gen_uname := v_base_uname;
  LOOP
    SELECT COUNT(*) INTO v_uname_count FROM user_faculty WHERE user_name = v_gen_uname;
    EXIT WHEN v_uname_count = 0;
    v_suffix := v_suffix + 1;
    v_gen_uname := v_base_uname || v_suffix::TEXT;
  END LOOP;

  SELECT ur.user_role_id INTO p_role_id FROM user_role ur WHERE UPPER(ur.user_role) = UPPER(p_role_name) LIMIT 1;
  IF p_role_id IS NULL THEN
    p_success := FALSE; p_message := format('Invalid role: "%s"', p_role_name);
    p_username := NULL; p_faculty_id := NULL; RETURN;
  END IF;

  IF p_department_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dept_count FROM department WHERE department_id = p_department_id;
    IF v_dept_count = 0 THEN
      p_success := FALSE; p_message := format('Department not found: id=%s', p_department_id);
      p_username := NULL; p_faculty_id := NULL; RETURN;
    END IF;
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
  v_current_year := CASE WHEN p_current_year IS NULL OR p_current_year < 0 THEN 0 ELSE p_current_year END;

  INSERT INTO user_faculty (
    faculty_id, user_name, first_name, last_name, gender,
    department_id, user_role_id, batch, course, current_year, last_updated_by
  ) VALUES (
    v_fac_id, v_gen_uname, p_first_name, COALESCE(p_last_name, ''), COALESCE(p_gender, ''),
    COALESCE(p_department_id, 0), p_role_id, v_batch, v_course, v_current_year, p_created_by
  );

  p_success := TRUE;
  p_message := format('Created: %s (%s)', v_gen_uname, v_fac_id);
  p_username := v_gen_uname;
  p_faculty_id := v_fac_id;
EXCEPTION WHEN OTHERS THEN
  p_success := FALSE; p_message := SQLERRM;
  p_username := NULL; p_faculty_id := NULL; p_role_id := NULL;
END;
$$ LANGUAGE plpgsql;
