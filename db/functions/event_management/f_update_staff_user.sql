DROP FUNCTION IF EXISTS event_management.sp_update_staff_user(VARCHAR,VARCHAR,VARCHAR,INT,VARCHAR,INT,VARCHAR,VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_update_staff_user(
  p_faculty_id    VARCHAR,
  p_first_name    VARCHAR,
  p_last_name     VARCHAR,
  p_department_id INT,
  p_batch         VARCHAR,
  p_current_year  INT,
  p_role_id       VARCHAR,
  p_updated_by    VARCHAR,
  OUT p_success BOOLEAN,
  OUT p_message VARCHAR
) AS $$
DECLARE
  v_count INT;
  v_dept_count INT;
  v_role_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_faculty WHERE faculty_id = p_faculty_id;
  IF v_count = 0 THEN
    p_success := FALSE; p_message := format('Staff not found: "%s"', p_faculty_id); RETURN;
  END IF;

  IF p_department_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dept_count FROM department WHERE department_id = p_department_id;
    IF v_dept_count = 0 THEN
      p_success := FALSE; p_message := format('Department not found: id=%s', p_department_id); RETURN;
    END IF;
  END IF;

  IF p_role_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_role_count FROM user_role WHERE user_role_id = p_role_id;
    IF v_role_count = 0 THEN
      p_success := FALSE; p_message := format('Role not found: id=%s', p_role_id); RETURN;
    END IF;
  END IF;

  UPDATE user_faculty SET
    first_name      = COALESCE(p_first_name, first_name),
    last_name       = COALESCE(p_last_name, last_name),
    department_id   = COALESCE(p_department_id, department_id),
    batch           = COALESCE(p_batch, batch),
    current_year    = COALESCE(p_current_year, current_year),
    user_role_id    = COALESCE(p_role_id, user_role_id),
    last_updated_by = p_updated_by,
    last_updated_on = now()
  WHERE faculty_id = p_faculty_id;

  p_success := TRUE;
  p_message := format('Staff updated successfully: %s', p_faculty_id);
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
