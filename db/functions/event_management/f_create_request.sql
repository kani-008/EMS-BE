-- Function: sp_create_request
-- Purpose: Insert a new request into request_main with auto-generated ID.
--          Default status: PS1 (Pending).
-- Node call: SELECT * FROM sp_create_request($1,...,$10)

DROP FUNCTION IF EXISTS event_management.sp_create_request(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, INT, INT, INT, VARCHAR, DATE);

CREATE OR REPLACE FUNCTION event_management.sp_create_request(
  p_requested_from   VARCHAR,
  p_requested_to     VARCHAR,
  p_request_type_id  VARCHAR,
  p_academic_year_id VARCHAR,
  p_course_id        VARCHAR,
  p_department_id    INT,
  p_current_year     INT,
  p_semester         INT,
  p_request_reason   VARCHAR,
  p_request_date     DATE
)
RETURNS TABLE(
  request_id VARCHAR,
  success    BOOLEAN,
  message    VARCHAR
) AS $$
DECLARE
  v_request_id VARCHAR;
BEGIN
  -- Generate a unique request ID using epoch + small random suffix
  v_request_id := 'RID' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT
                         || LPAD((FLOOR(RANDOM() * 999) + 1)::INT::TEXT, 3, '0');

  INSERT INTO event_management.request_main (
    request_id,
    requested_from,
    requested_to,
    request_type_id,
    request_status_id,
    academic_year_id,
    course_id,
    department_id,
    current_year,
    semester,
    request_reason,
    request_date,
    last_updated_by
  ) VALUES (
    v_request_id,
    p_requested_from,
    p_requested_to,
    p_request_type_id,
    'PS1',                    -- Pending
    p_academic_year_id,
    p_course_id,
    p_department_id,
    p_current_year,
    p_semester,
    p_request_reason,
    p_request_date,
    p_requested_from
  );

  RETURN QUERY SELECT v_request_id, TRUE, 'Request created successfully'::VARCHAR;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::VARCHAR, FALSE, SQLERRM::VARCHAR;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
