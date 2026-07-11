-- Function: credentials.sp_soft_delete_user
-- Purpose: Soft-delete a user (student or staff) by flipping their login
--          status to INACTIVE. Matches the existing status-toggle convention
--          used by Activate/Inactivate — there is no hard-delete path for
--          any user-type entity in this schema.
-- Database: credentials

CREATE OR REPLACE FUNCTION credentials.sp_soft_delete_user(
  p_user_name   VARCHAR,
  p_updated_by  VARCHAR
)
RETURNS TABLE (
  p_success BOOLEAN,
  p_message VARCHAR
) AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE credentials.table_login
  SET status = 'INACTIVE',
      last_updated_by = p_updated_by
  WHERE user_name = p_user_name;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN QUERY SELECT FALSE, 'User not found'::VARCHAR;
  ELSE
    RETURN QUERY SELECT TRUE, 'User deleted successfully'::VARCHAR;
  END IF;
END;
$$ LANGUAGE plpgsql;
