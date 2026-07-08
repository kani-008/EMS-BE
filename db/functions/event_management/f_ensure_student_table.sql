-- Function: sp_ensure_student_table
-- Purpose: Create the per-department student table user_student_<dept> if it
--          doesn't exist yet, and return its name.
-- NOTE: this procedure was CALLED by admin.service.js (createUsersService)
-- in the original repo but never actually existed under db/procedures/ —
-- createUsersService was silently broken. It's implemented here for real.
--
-- Naming fix: standardized on user_student_<lowercase department_name>
-- (matches the table that sp_create_student_user's INSERT already targeted).
-- The old sp_get_advisor_students / sp_update_student / sp_promote_year_for_batch
-- looked for user_student_<batch>_<dept> instead — that mismatch is fixed by
-- having every function in this migration use this one naming convention.
-- Database: event_management
-- Node call:  SELECT * FROM sp_ensure_student_table($1);

DROP FUNCTION IF EXISTS event_management.sp_ensure_student_table(VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_ensure_student_table(p_department_name VARCHAR)
RETURNS TABLE(table_name VARCHAR) AS $$
DECLARE
  v_table_name VARCHAR;
BEGIN
  IF p_department_name IS NULL OR TRIM(p_department_name) = '' THEN
    RAISE EXCEPTION 'Department name is required to build the student table name';
  END IF;

  v_table_name := 'user_student_' || LOWER(REGEXP_REPLACE(TRIM(p_department_name), '[^A-Za-z0-9]', '', 'g'));

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS event_management.%I (
      s_no                SERIAL PRIMARY KEY,
      roll_no             VARCHAR(100) NOT NULL UNIQUE,
      registration_no     VARCHAR(100),
      first_name          VARCHAR(255),
      last_name           VARCHAR(255),
      user_name           VARCHAR(255) NOT NULL UNIQUE,
      gender              VARCHAR(50),
      contact             VARCHAR(20),
      academic_year_id    VARCHAR(50),
      department_id       INT NOT NULL REFERENCES department(department_id),
      current_year        INT,
      course              VARCHAR(100),
      semester            INT,
      batch               VARCHAR(50),
      hosteller           VARCHAR(10),
      student_admission   VARCHAR(50),
      admission_type      VARCHAR(50),
      user_profile        VARCHAR(255),
      course_completed    BOOLEAN DEFAULT FALSE,
      status              VARCHAR(50) DEFAULT 'ACTIVE',
      created_on          TIMESTAMP DEFAULT now(),
      last_updated_by     VARCHAR(255),
      last_updated_on     TIMESTAMP DEFAULT now()
    )
  $f$, v_table_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (batch)', v_table_name || '_batch_idx', v_table_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (status)', v_table_name || '_status_idx', v_table_name);
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', v_table_name || '_updated', v_table_name);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on()',
    v_table_name || '_updated', v_table_name
  );

  RETURN QUERY SELECT v_table_name;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
