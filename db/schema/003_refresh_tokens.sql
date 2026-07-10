-- ============================================================================
-- SCHEMA credentials: table refresh_tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS credentials.refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_name   VARCHAR(255) NOT NULL REFERENCES credentials.table_login(user_name) ON DELETE CASCADE,
  token       VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT now() NOT NULL,
  revoked_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_name ON credentials.refresh_tokens(user_name);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON credentials.refresh_tokens(token);
