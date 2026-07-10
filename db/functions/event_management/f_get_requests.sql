-- Function: sp_get_requests
-- Purpose: Return requests filtered by caller role.
--   STUDENT  → only their own submitted requests
--   ADMIN    → all requests
--   STAFF/HOD/ADVISOR/… → requests directed to them
-- Node call: SELECT * FROM sp_get_requests($1, $2)  [username, role]

DROP FUNCTION IF EXISTS event_management.sp_get_requests(VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_get_requests(
  p_username VARCHAR,
  p_role     VARCHAR
)
RETURNS TABLE(
  request_id        VARCHAR,
  requested_from    VARCHAR,
  requested_to      VARCHAR,
  request_type      VARCHAR,
  request_type_id   VARCHAR,
  request_status    VARCHAR,
  request_status_id VARCHAR,
  current_year      INT,
  semester          INT,
  course_id         VARCHAR,
  department_name   VARCHAR,
  created_on        TIMESTAMP,
  request_date      DATE,
  request_reason    VARCHAR
) AS $$
BEGIN
  IF p_role = 'STUDENT' THEN
    RETURN QUERY
      SELECT
        rm.request_id,
        rm.requested_from,
        rm.requested_to,
        rt.request_type,
        rm.request_type_id,
        ps.request_status,
        rm.request_status_id,
        rm.current_year,
        rm.semester,
        rm.course_id,
        COALESCE(d.department_name, '') AS department_name,
        rm.created_on,
        rm.request_date,
        rm.request_reason
      FROM event_management.request_main rm
      LEFT JOIN event_management.request_type    rt ON rm.request_type_id   = rt.request_type_id
      LEFT JOIN event_management.progress_status ps ON rm.request_status_id = ps.request_status_id
      LEFT JOIN event_management.department       d ON rm.department_id      = d.department_id
      WHERE rm.requested_from = p_username
      ORDER BY rm.created_on DESC;

  ELSIF p_role = 'ADMIN' THEN
    RETURN QUERY
      SELECT
        rm.request_id,
        rm.requested_from,
        rm.requested_to,
        rt.request_type,
        rm.request_type_id,
        ps.request_status,
        rm.request_status_id,
        rm.current_year,
        rm.semester,
        rm.course_id,
        COALESCE(d.department_name, '') AS department_name,
        rm.created_on,
        rm.request_date,
        rm.request_reason
      FROM event_management.request_main rm
      LEFT JOIN event_management.request_type    rt ON rm.request_type_id   = rt.request_type_id
      LEFT JOIN event_management.progress_status ps ON rm.request_status_id = ps.request_status_id
      LEFT JOIN event_management.department       d ON rm.department_id      = d.department_id
      ORDER BY rm.created_on DESC;

  ELSE
    -- ADVISOR / HOD / PRINCIPAL / FACULTY / PLACEMENT / SPORTS
    RETURN QUERY
      SELECT
        rm.request_id,
        rm.requested_from,
        rm.requested_to,
        rt.request_type,
        rm.request_type_id,
        ps.request_status,
        rm.request_status_id,
        rm.current_year,
        rm.semester,
        rm.course_id,
        COALESCE(d.department_name, '') AS department_name,
        rm.created_on,
        rm.request_date,
        rm.request_reason
      FROM event_management.request_main rm
      LEFT JOIN event_management.request_type    rt ON rm.request_type_id   = rt.request_type_id
      LEFT JOIN event_management.progress_status ps ON rm.request_status_id = ps.request_status_id
      LEFT JOIN event_management.department       d ON rm.department_id      = d.department_id
      WHERE rm.requested_to = p_username
      ORDER BY rm.created_on DESC;
  END IF;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
