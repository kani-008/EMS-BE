-- Function: credentials.sp_get_refresh_token
-- Purpose: Get non-expired raw refresh token record.
-- Database: credentials

DROP FUNCTION IF EXISTS credentials.sp_get_refresh_token(VARCHAR);

CREATE OR REPLACE FUNCTION credentials.sp_get_refresh_token(
  p_token VARCHAR
)
RETURNS TABLE (
  id          INT,
  user_name   VARCHAR,
  token       VARCHAR,
  expires_at  TIMESTAMP,
  created_on  TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT rt.id, rt.user_name, rt.token, rt.expires_at, rt.created_on
  FROM credentials.refresh_tokens rt
  WHERE rt.token = p_token
    AND rt.expires_at > now();
END;
$$ LANGUAGE plpgsql;
