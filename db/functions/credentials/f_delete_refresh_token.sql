-- Function: credentials.sp_delete_refresh_token
-- Purpose: Hard-delete a specific refresh token row.
-- Database: credentials

CREATE OR REPLACE FUNCTION credentials.sp_delete_refresh_token(
  p_token VARCHAR
) RETURNS VOID AS $$
BEGIN
  DELETE FROM credentials.refresh_tokens
  WHERE token = p_token;
END;
$$ LANGUAGE plpgsql;
