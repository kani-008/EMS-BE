-- ============================================================================
-- DATABASE: credentials  (Authentication Only)
-- Run this against a Postgres database named `credentials`
-- (createdb credentials  &&  psql -d credentials -f 001_credentials_schema.sql)
-- ============================================================================

-- Generic trigger function: keeps last_updated_on current on every UPDATE.
-- (Postgres has no "ON UPDATE CURRENT_TIMESTAMP" column clause like MySQL.)
CREATE OR REPLACE FUNCTION set_last_updated_on()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_on = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Table: table_login  (User authentication and role assignment)
-- ============================================================================
CREATE TABLE IF NOT EXISTS table_login (
  s_no             SERIAL PRIMARY KEY,
  user_name        VARCHAR(255) NOT NULL UNIQUE,
  password         VARCHAR(255) NOT NULL,                 -- bcrypt hash
  user_role_id     VARCHAR(50),
  department_id    INT,
  status           VARCHAR(50) DEFAULT 'ACTIVE',
  last_updated_by  VARCHAR(255),
  last_updated_on  TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_login_user_name     ON table_login (user_name);
CREATE INDEX IF NOT EXISTS idx_table_login_department_id ON table_login (department_id);
CREATE INDEX IF NOT EXISTS idx_table_login_status         ON table_login (status);

DROP TRIGGER IF EXISTS trg_table_login_updated ON table_login;
CREATE TRIGGER trg_table_login_updated
  BEFORE UPDATE ON table_login
  FOR EACH ROW EXECUTE FUNCTION set_last_updated_on();

-- ============================================================================
-- Table: table_role  (Admin-side role reference — credentials DB only)
-- R08 = ADMIN is not in event_management.user_role, so it's defined here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS table_role (
  role_id   VARCHAR(10)  PRIMARY KEY,
  role_name VARCHAR(100) NOT NULL
);

INSERT INTO table_role (role_id, role_name)
VALUES ('R08', 'ADMIN')
ON CONFLICT (role_id) DO UPDATE SET role_name = EXCLUDED.role_name;

-- ============================================================================
-- SEED DATA — Test users (same accounts/passwords as the MySQL version)
-- ============================================================================
INSERT INTO table_login (user_name, password, user_role_id, department_id, status)
VALUES ('vasuki', '$2b$12$GrnKm.4wcVTd8mh0vXIVa.2tHUYJJVLSwydxz0GoNSGBingYloDxq', 'R03', 104, 'ACTIVE')
ON CONFLICT (user_name) DO NOTHING;

INSERT INTO table_login (user_name, password, user_role_id, department_id, status)
VALUES ('admin1', '$2b$12$tmt.3URaxFR3kbVQZcgdheYP9J6/iYLWXsfJvXvIUzTr8PnqRdLSi', 'R08', NULL, 'ACTIVE')
ON CONFLICT (user_name) DO NOTHING;

INSERT INTO table_login (user_name, password, user_role_id, department_id, status)
VALUES ('student001', '$2b$12$.gK3QGC7T.lrdMDTgNlZTe.iEOQaizhQki/oX9J6e4Yizy6l5YQBu', 'R01', 104, 'ACTIVE')
ON CONFLICT (user_name) DO NOTHING;
