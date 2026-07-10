-- Function: credentials.sp_insert_refresh_token
-- Purpose: Insert a raw refresh token and revoke/delete any prior tokens for the user.
-- Database: credentials

CREATE OR REPLACE FUNCTION credentials.sp_insert_refresh_token(
  p_user_name   VARCHAR,
  p_token       VARCHAR,
  p_expires_at  TIMESTAMP
) RETURNS VOID AS $$
BEGIN
  -- Revoke/delete prior active tokens for this user (single session model)
  DELETE FROM credentials.refresh_tokens
  WHERE user_name = p_user_name;

  -- Insert new token
  INSERT INTO credentials.refresh_tokens (user_name, token, expires_at)
  VALUES (p_user_name, p_token, p_expires_at);
END;
$$ LANGUAGE plpgsql;
