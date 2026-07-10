-- Function: sp_get_request_types
-- Purpose: Return all available request types (for dropdowns in create form).
-- Node call: SELECT * FROM sp_get_request_types()

DROP FUNCTION IF EXISTS event_management.sp_get_request_types();

CREATE OR REPLACE FUNCTION event_management.sp_get_request_types()
RETURNS TABLE(
  request_type_id VARCHAR,
  request_type    VARCHAR
) AS $$
BEGIN
  RETURN QUERY
    SELECT rt.request_type_id, rt.request_type
    FROM event_management.request_type rt
    ORDER BY rt.request_type;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
