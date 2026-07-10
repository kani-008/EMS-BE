-- Function: credentials.sp_insert_refresh_token
-- Purpose: Insert a new refresh token and revoke any prior active tokens for the user.
-- Database: credentials

CREATE OR REPLACE FUNCTION credentials.sp_insert_refresh_token(
  p_user_name   VARCHAR,
  p_token       VARCHAR,
  p_expires_at  TIMESTAMP
) RETURNS VOID AS $$
BEGIN
  -- Revoke prior active tokens for this user
  UPDATE credentials.refresh_tokens
  SET revoked_at = now()
  WHERE user_name = p_user_name AND revoked_at IS NULL;

  -- Insert new token
  INSERT INTO credentials.refresh_tokens (user_name, token, expires_at)
  VALUES (p_user_name, p_token, p_expires_at);
END;
$$ LANGUAGE plpgsql;
