-- Function: credentials.sp_revoke_refresh_token
-- Purpose: Revoke a specific refresh token.
-- Database: credentials

CREATE OR REPLACE FUNCTION credentials.sp_revoke_refresh_token(
  p_token VARCHAR
) RETURNS VOID AS $$
BEGIN
  UPDATE credentials.refresh_tokens
  SET revoked_at = now()
  WHERE token = p_token AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql;
