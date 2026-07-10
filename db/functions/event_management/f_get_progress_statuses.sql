-- Function: sp_get_progress_statuses
-- Purpose: Return all workflow statuses (for Settings page and filters).
-- Node call: SELECT * FROM sp_get_progress_statuses()

DROP FUNCTION IF EXISTS event_management.sp_get_progress_statuses();

CREATE OR REPLACE FUNCTION event_management.sp_get_progress_statuses()
RETURNS TABLE(
  request_status_id VARCHAR,
  request_status    VARCHAR
) AS $$
BEGIN
  RETURN QUERY
    SELECT ps.request_status_id, ps.request_status
    FROM event_management.progress_status ps
    ORDER BY ps.request_status_id;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
