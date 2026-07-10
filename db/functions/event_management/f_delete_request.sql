-- Function: sp_delete_request
-- Purpose: Hard-delete a request (cascade: progress logs → event details → main).
--          Authorization: STUDENT can only delete their own; pass 'ADMIN' role
--          to bypass ownership check.
-- Node call: SELECT * FROM sp_delete_request($1, $2)  [request_id, username_or_ADMIN]

DROP FUNCTION IF EXISTS event_management.sp_delete_request(VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_delete_request(
  p_request_id VARCHAR,
  p_username   VARCHAR   -- the caller's username, or literal 'ADMIN' to bypass
)
RETURNS TABLE(
  success BOOLEAN,
  message VARCHAR
) AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Verify the request exists AND the caller is authorized
  SELECT EXISTS(
    SELECT 1 FROM event_management.request_main
    WHERE request_id = p_request_id
      AND (requested_from = p_username OR p_username = 'ADMIN')
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN QUERY SELECT FALSE, 'Request not found or unauthorized'::VARCHAR;
    RETURN;
  END IF;

  -- Cascade: delete child records first
  DELETE FROM event_management.request_progress WHERE request_id = p_request_id;
  DELETE FROM event_management.request_events   WHERE request_id = p_request_id;
  DELETE FROM event_management.request_main     WHERE request_id = p_request_id;

  RETURN QUERY SELECT TRUE, 'Request deleted successfully'::VARCHAR;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, SQLERRM::VARCHAR;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
