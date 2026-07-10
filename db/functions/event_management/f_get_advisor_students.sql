-- Function: sp_get_advisor_students
-- Purpose: Get all student records for the advisor's department, filtered to
--          the advisor's own batch.
-- Database: event_management
-- Node call:  SELECT * FROM sp_get_advisor_students($1);

DROP FUNCTION IF EXISTS event_management.sp_get_advisor_students(VARCHAR);
DROP FUNCTION IF EXISTS event_management.sp_get_advisor_students(VARCHAR, VARCHAR[], INT[], INT[], VARCHAR[]);

CREATE OR REPLACE FUNCTION event_management.sp_get_advisor_students(
  p_advisor_username VARCHAR,
  p_courses VARCHAR[] DEFAULT NULL,
  p_years INT[] DEFAULT NULL,
  p_semesters INT[] DEFAULT NULL,
  p_statuses VARCHAR[] DEFAULT NULL
)
RETURNS TABLE(
  s_no INT, roll_no VARCHAR, registration_no VARCHAR, first_name VARCHAR, last_name VARCHAR,
  user_name VARCHAR, gender VARCHAR, contact VARCHAR, academic_year_id VARCHAR,
  department_id INT, current_year INT, course VARCHAR, semester INT, batch VARCHAR,
  hosteller VARCHAR, student_admission VARCHAR, admission_type VARCHAR, user_profile VARCHAR,
  course_completed BOOLEAN, status VARCHAR, created_on TIMESTAMP, last_updated_by VARCHAR,
  last_updated_on TIMESTAMP, department_name VARCHAR
) AS $$
DECLARE
  v_dept_name  VARCHAR;
  v_batch      VARCHAR;
  v_table_name VARCHAR;
  v_exists     BOOLEAN;
  v_query      VARCHAR;
BEGIN
  SELECT d.department_name, uf.batch INTO v_dept_name, v_batch
  FROM user_faculty uf
  INNER JOIN department d ON uf.department_id = d.department_id
  WHERE uf.user_name = p_advisor_username
  LIMIT 1;

  IF v_dept_name IS NULL OR v_batch IS NULL THEN
    RETURN;
  END IF;

  v_table_name := 'user_student_' || LOWER(REGEXP_REPLACE(v_dept_name, '[^A-Za-z0-9]', '', 'g'));

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'event_management' AND table_name = v_table_name
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN;
  END IF;

  v_query := format(
    'SELECT s.s_no, s.roll_no, s.registration_no, s.first_name, s.last_name, s.user_name,
            s.gender, s.contact, s.academic_year_id, s.department_id, s.current_year, s.course,
            s.semester, s.batch, s.hosteller, s.student_admission, s.admission_type, s.user_profile,
            s.course_completed, s.status, s.created_on, s.last_updated_by, s.last_updated_on,
            d.department_name
     FROM event_management.%I s
     LEFT JOIN department d ON s.department_id = d.department_id
     WHERE s.batch = $1 AND
           ($2 IS NULL OR s.course = ANY($2)) AND
           ($3 IS NULL OR s.current_year = ANY($3)) AND
           ($4 IS NULL OR s.semester = ANY($4)) AND
           ($5 IS NULL OR s.status = ANY($5))
     ORDER BY s.created_on DESC',
    v_table_name
  );

  RETURN QUERY EXECUTE v_query
  USING v_batch, p_courses, p_years, p_semesters, p_statuses;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;

