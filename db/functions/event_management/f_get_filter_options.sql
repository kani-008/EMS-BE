-- Function: sp_get_filter_options
-- Purpose: Get unique filter options for course, year, semester, status, and role dynamically from DB tables.
-- Database: event_management

-- Seed courses if empty
INSERT INTO event_management.course (course_id, course_name)
VALUES ('B.E', 'B.E'), ('M.E', 'M.E')
ON CONFLICT (course_id) DO NOTHING;

DROP FUNCTION IF EXISTS event_management.sp_get_filter_options();

CREATE OR REPLACE FUNCTION event_management.sp_get_filter_options()
RETURNS TABLE(
  courses VARCHAR[],
  years INT[],
  semesters INT[],
  statuses VARCHAR[],
  roles VARCHAR[]
) AS $$
DECLARE
  v_courses VARCHAR[];
  v_years INT[];
  v_semesters INT[];
  v_statuses VARCHAR[];
  v_roles VARCHAR[];
BEGIN
  -- Get unique courses
  SELECT array_agg(DISTINCT course_id ORDER BY course_id) INTO v_courses FROM event_management.course;
  IF v_courses IS NULL THEN
    v_courses := ARRAY['B.E', 'M.E']::VARCHAR[];
  END IF;

  -- Predefined/derived years
  v_years := ARRAY[1, 2, 3, 4]::INT[];

  -- Predefined/derived semesters
  v_semesters := ARRAY[1, 2, 3, 4, 5, 6, 7, 8]::INT[];

  -- Get unique statuses
  SELECT array_agg(DISTINCT UPPER(status) ORDER BY UPPER(status)) INTO v_statuses
  FROM credentials.table_login
  WHERE status IS NOT NULL;
  
  IF v_statuses IS NULL THEN
    v_statuses := ARRAY['ACTIVE', 'INACTIVE']::VARCHAR[];
  END IF;

  -- Get unique roles (mapping from table_role + user_role)
  SELECT array_agg(DISTINCT UPPER(role_name) ORDER BY UPPER(role_name)) INTO v_roles
  FROM (
    SELECT role_name FROM credentials.table_role
    UNION
    SELECT user_role AS role_name FROM event_management.user_role
  ) r;

  RETURN QUERY SELECT v_courses, v_years, v_semesters, v_statuses, v_roles;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
