-- Function: sp_update_request_status
-- Purpose: Update a request's status and log the action to request_progress.
-- Node call: SELECT * FROM sp_update_request_status($1,$2,$3,$4)
--            [request_id, status_id, updated_by, forwarded_to (nullable)]

DROP FUNCTION IF EXISTS event_management.sp_update_request_status(VARCHAR, VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_update_request_status(
  p_request_id   VARCHAR,
  p_status_id    VARCHAR,  -- PS1=Pending PS2=Forwarded PS3=Accepted PS4=Declined
  p_updated_by   VARCHAR,
  p_forwarded_to VARCHAR    -- only relevant for forward action; NULL otherwise
)
RETURNS TABLE(
  success BOOLEAN,
  message VARCHAR
) AS $$
DECLARE
  v_old_requested_to VARCHAR;
BEGIN
  -- Fetch current requested_to for the progress log
  SELECT requested_to INTO v_old_requested_to
  FROM event_management.request_main
  WHERE request_id = p_request_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Request not found'::VARCHAR;
    RETURN;
  END IF;

  -- Update main record
  UPDATE event_management.request_main
  SET
    request_status_id = p_status_id,
    last_updated_by   = p_updated_by,
    -- If forwarding, update the recipient; otherwise keep existing
    requested_to      = COALESCE(p_forwarded_to, requested_to)
  WHERE request_id = p_request_id;

  -- Log to request_progress
  INSERT INTO event_management.request_progress (
    request_id,
    forwarded_from,
    forwarded_to,
    request_status_id,
    last_updated_by
  ) VALUES (
    p_request_id,
    p_updated_by,
    COALESCE(p_forwarded_to, v_old_requested_to),
    p_status_id,
    p_updated_by
  );

  RETURN QUERY SELECT TRUE, 'Status updated successfully'::VARCHAR;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, SQLERRM::VARCHAR;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
