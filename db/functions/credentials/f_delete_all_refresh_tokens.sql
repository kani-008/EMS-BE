-- Function: credentials.sp_delete_all_refresh_tokens
-- Purpose: Hard-delete all refresh token rows for a user.
-- Database: credentials

CREATE OR REPLACE FUNCTION credentials.sp_delete_all_refresh_tokens(
  p_user_name VARCHAR
) RETURNS VOID AS $$
BEGIN
  DELETE FROM credentials.refresh_tokens
  WHERE user_name = p_user_name;
END;
$$ LANGUAGE plpgsql;
