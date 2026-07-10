-- Function: credentials.sp_get_refresh_token
-- Purpose: Get non-revoked and non-expired refresh token record.
-- Database: credentials

CREATE OR REPLACE FUNCTION credentials.sp_get_refresh_token(
  p_token VARCHAR
)
RETURNS TABLE (
  id          INT,
  user_name   VARCHAR,
  token       VARCHAR,
  expires_at  TIMESTAMP,
  created_at  TIMESTAMP,
  revoked_at  TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT rt.id, rt.user_name, rt.token, rt.expires_at, rt.created_at, rt.revoked_at
  FROM credentials.refresh_tokens rt
  WHERE rt.token = p_token
    AND rt.revoked_at IS NULL
    AND rt.expires_at > now();
END;
$$ LANGUAGE plpgsql;
