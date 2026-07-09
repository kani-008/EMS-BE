-- ============================================================================
-- SCHEMA: event_management  (Academic & Operational Data)
-- Run against your single Supabase database, after 000_schemas.sql and
-- 001_credentials_schema.sql.
-- (psql "$DATABASE_URL" -f 002_event_management_schema.sql)
-- ============================================================================

-- ============================================================================
-- Table: department
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_management.department (
  s_no             SERIAL PRIMARY KEY,
  department_id    INT NOT NULL UNIQUE,
  department_name  VARCHAR(255) NOT NULL,
  department_hod   VARCHAR(255),
  created_on       TIMESTAMP DEFAULT now(),
  last_updated_by  VARCHAR(255),
  last_updated_on  TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_department_name ON event_management.department (department_name);
DROP TRIGGER IF EXISTS trg_department_updated ON event_management.department;
CREATE TRIGGER trg_department_updated BEFORE UPDATE ON event_management.department
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

-- ============================================================================
-- Table: academic_year
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_management.academic_year (
  s_no              SERIAL PRIMARY KEY,
  academic_year_id  VARCHAR(50) NOT NULL UNIQUE,
  academic_year     VARCHAR(255) NOT NULL,        -- e.g. '2023-2027'
  department_list   JSONB,
  created_on        TIMESTAMP DEFAULT now(),
  last_updated_by   VARCHAR(255),
  last_updated_on   TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_academic_year ON event_management.academic_year (academic_year);
DROP TRIGGER IF EXISTS trg_academic_year_updated ON event_management.academic_year;
CREATE TRIGGER trg_academic_year_updated BEFORE UPDATE ON event_management.academic_year
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

-- ============================================================================
-- Table: user_role
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_management.user_role (
  s_no             SERIAL PRIMARY KEY,
  user_role_id     VARCHAR(50) NOT NULL UNIQUE,
  user_role        VARCHAR(255) NOT NULL,
  created_on       TIMESTAMP DEFAULT now(),
  last_updated_by  VARCHAR(255),
  last_updated_on  TIMESTAMP DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_user_role_updated ON event_management.user_role;
CREATE TRIGGER trg_user_role_updated BEFORE UPDATE ON event_management.user_role
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

-- ============================================================================
-- Table: user_faculty  (Advisors, Faculty, HOD, Principal, ...)
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_management.user_faculty (
  s_no             SERIAL PRIMARY KEY,
  faculty_id       VARCHAR(255) NOT NULL UNIQUE,
  first_name       VARCHAR(255),
  last_name        VARCHAR(255),
  user_name        VARCHAR(255) NOT NULL,
  gender           VARCHAR(50),
  contact          VARCHAR(20),
  user_role_id     VARCHAR(50) REFERENCES event_management.user_role(user_role_id),
  academic_year_id VARCHAR(50) REFERENCES event_management.academic_year(academic_year_id),
  department_id    INT NOT NULL REFERENCES event_management.department(department_id),
  current_year     INT NOT NULL DEFAULT 0,
  batch            VARCHAR(50) NOT NULL DEFAULT 'N/A',
  course           VARCHAR(100) DEFAULT '-',
  user_profile     VARCHAR(255),
  created_on       TIMESTAMP DEFAULT now(),
  last_updated_by  VARCHAR(255),
  last_updated_on  TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_faculty_user_name       ON event_management.user_faculty (user_name);
CREATE INDEX IF NOT EXISTS idx_user_faculty_department_id   ON event_management.user_faculty (department_id);
CREATE INDEX IF NOT EXISTS idx_user_faculty_dept_year_batch ON event_management.user_faculty (department_id, current_year, batch);
CREATE INDEX IF NOT EXISTS idx_user_faculty_role_id         ON event_management.user_faculty (user_role_id);
DROP TRIGGER IF EXISTS trg_user_faculty_updated ON event_management.user_faculty;
CREATE TRIGGER trg_user_faculty_updated BEFORE UPDATE ON event_management.user_faculty
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

-- ============================================================================
-- SEED DATA
-- ============================================================================
INSERT INTO event_management.department (department_id, department_name, department_hod) VALUES
  (102, 'AUTO',  'Dr. AUTO HOD'),
  (103, 'CIVIL', 'Dr. CIVIL HOD'),
  (104, 'CSE',   'Dr. CSE HOD'),
  (105, 'EEE',   'Dr. EEE HOD'),
  (106, 'ECE',   'Dr. ECE HOD'),
  (114, 'MECH',  'Dr. MECH HOD'),
  (205, 'IMT',   'Dr. IMT HOD'),
  (243, 'DS',    'Dr. DS HOD')
ON CONFLICT (department_id) DO UPDATE
  SET department_name = EXCLUDED.department_name, department_hod = EXCLUDED.department_hod;

INSERT INTO event_management.academic_year (academic_year_id, academic_year, department_list) VALUES
  ('AY2021', '2021-2025', '[102,103,104,105,106,114,205]'),
  ('AY2022', '2022-2026', '[102,103,104,105,106,114,205]'),
  ('AY2023', '2023-2027', '[102,103,104,105,106,114,205]'),
  ('AY2024', '2024-2028', '[102,103,104,105,106,114,205]'),
  ('AY2025', '2025-2029', '[102,103,104,105,106,114,205,243]')
ON CONFLICT (academic_year_id) DO UPDATE
  SET academic_year = EXCLUDED.academic_year, department_list = EXCLUDED.department_list;

INSERT INTO event_management.user_role (user_role_id, user_role) VALUES
  ('R01', 'STUDENT'),
  ('R02', 'FACULTY'),
  ('R03', 'ADVISOR'),
  ('R04', 'HOD'),
  ('R05', 'PRINCIPAL'),
  ('R06', 'PLACEMENT'),
  ('R07', 'SPORTS')
ON CONFLICT (user_role_id) DO UPDATE SET user_role = EXCLUDED.user_role;

INSERT INTO event_management.user_faculty
  (faculty_id, first_name, last_name, user_name, gender, user_role_id, academic_year_id, department_id, current_year, batch)
VALUES
  ('FAC001', 'Vasuki', 'Advisor', 'vasuki', 'Female', 'R03', 'AY2023', 104, 3, '2023')
ON CONFLICT (faculty_id) DO UPDATE
  SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name;

-- ============================================================================
-- Tables from the Excel schema that existed only as commented-out MySQL DDL —
-- brought online here since the schema doc lists them as part of the model.
-- Not yet wired into any backend service; included so the DB is schema-complete.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_management.course (
  s_no             SERIAL PRIMARY KEY,
  course_id        VARCHAR(100) NOT NULL UNIQUE,
  course_name      VARCHAR(255) NOT NULL,
  created_on       TIMESTAMP DEFAULT now(),
  last_updated_by  VARCHAR(255),
  last_updated_on  TIMESTAMP DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_course_updated ON event_management.course;
CREATE TRIGGER trg_course_updated BEFORE UPDATE ON event_management.course
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

CREATE TABLE IF NOT EXISTS event_management.event_level (
  s_no             SERIAL PRIMARY KEY,
  event_level_id   VARCHAR(100) NOT NULL UNIQUE,
  event_level      VARCHAR(255),
  created_on       TIMESTAMP DEFAULT now(),
  last_updated_by  VARCHAR(255),
  last_updated_on  TIMESTAMP DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_event_level_updated ON event_management.event_level;
CREATE TRIGGER trg_event_level_updated BEFORE UPDATE ON event_management.event_level
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

INSERT INTO event_management.event_level (event_level_id, event_level) VALUES
  ('EL1', 'National Level'),
  ('EL2', 'International Level')
ON CONFLICT (event_level_id) DO UPDATE SET event_level = EXCLUDED.event_level;

CREATE TABLE IF NOT EXISTS event_management.event_organizer (
  s_no                SERIAL PRIMARY KEY,
  event_organizer_id  VARCHAR(100) NOT NULL UNIQUE,
  organizer           VARCHAR(255),
  created_on          TIMESTAMP DEFAULT now(),
  last_updated_by     VARCHAR(255),
  last_updated_on     TIMESTAMP DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_event_organizer_updated ON event_management.event_organizer;
CREATE TRIGGER trg_event_organizer_updated BEFORE UPDATE ON event_management.event_organizer
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

INSERT INTO event_management.event_organizer (event_organizer_id, organizer) VALUES
  ('EO1', 'GCE - CSE'),
  ('EO2', 'GCE - ECE'),
  ('EO3', 'GCE - MECH')
ON CONFLICT (event_organizer_id) DO UPDATE SET organizer = EXCLUDED.organizer;

CREATE TABLE IF NOT EXISTS event_management.request_type (
  s_no             SERIAL PRIMARY KEY,
  request_type_id  VARCHAR(100) NOT NULL UNIQUE,
  request_type     VARCHAR(255),
  created_on       TIMESTAMP DEFAULT now(),
  last_updated_by  VARCHAR(255),
  last_updated_on  TIMESTAMP DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_request_type_updated ON event_management.request_type;
CREATE TRIGGER trg_request_type_updated BEFORE UPDATE ON event_management.request_type
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

INSERT INTO event_management.request_type (request_type_id, request_type) VALUES
  ('RT1', 'Leave'),
  ('RT2', 'Sports'),
  ('RT3', 'OD'),
  ('RT4', 'Bonafide')
ON CONFLICT (request_type_id) DO UPDATE SET request_type = EXCLUDED.request_type;

CREATE TABLE IF NOT EXISTS event_management.progress_status (
  s_no               SERIAL PRIMARY KEY,
  request_status_id  VARCHAR(100) NOT NULL UNIQUE,
  request_status     VARCHAR(255),
  created_on         TIMESTAMP DEFAULT now(),
  last_updated_by    VARCHAR(255),
  last_updated_on    TIMESTAMP DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_progress_status_updated ON event_management.progress_status;
CREATE TRIGGER trg_progress_status_updated BEFORE UPDATE ON event_management.progress_status
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

INSERT INTO event_management.progress_status (request_status_id, request_status) VALUES
  ('PS1', 'Pending'),
  ('PS2', 'Forwarded'),
  ('PS3', 'Accepted'),
  ('PS4', 'Declined')
ON CONFLICT (request_status_id) DO UPDATE SET request_status = EXCLUDED.request_status;

CREATE TABLE IF NOT EXISTS event_management.request_main (
  s_no               SERIAL PRIMARY KEY,
  request_id         VARCHAR(100) NOT NULL UNIQUE,
  requested_from     VARCHAR(255),
  requested_to       VARCHAR(255),
  request_type_id    VARCHAR(100) REFERENCES event_management.request_type(request_type_id),
  request_status_id  VARCHAR(100) REFERENCES event_management.progress_status(request_status_id),
  academic_year_id   VARCHAR(100),
  department_id      INT,
  course_id          VARCHAR(100),
  current_year       INT,
  semester           INT,
  request_reason     VARCHAR(500),
  request_date       DATE,
  created_on         TIMESTAMP DEFAULT now(),
  last_updated_by    VARCHAR(255),
  last_updated_on    TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_main_status ON event_management.request_main (request_status_id);
CREATE INDEX IF NOT EXISTS idx_request_main_dept   ON event_management.request_main (department_id);
CREATE INDEX IF NOT EXISTS idx_request_main_course ON event_management.request_main (course_id);
DROP TRIGGER IF EXISTS trg_request_main_updated ON event_management.request_main;
CREATE TRIGGER trg_request_main_updated BEFORE UPDATE ON event_management.request_main
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

CREATE TABLE IF NOT EXISTS event_management.request_events (
  s_no                SERIAL PRIMARY KEY,
  request_id          VARCHAR(100) NOT NULL UNIQUE REFERENCES event_management.request_main(request_id),
  event_name          VARCHAR(255),
  event_level_id      VARCHAR(100) REFERENCES event_management.event_level(event_level_id),
  event_organizer_id  VARCHAR(100) REFERENCES event_management.event_organizer(event_organizer_id),
  notes               VARCHAR(500),
  created_on          TIMESTAMP DEFAULT now(),
  last_updated_by     VARCHAR(255),
  last_updated_on     TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_events_level     ON event_management.request_events (event_level_id);
CREATE INDEX IF NOT EXISTS idx_request_events_organizer ON event_management.request_events (event_organizer_id);
DROP TRIGGER IF EXISTS trg_request_events_updated ON event_management.request_events;
CREATE TRIGGER trg_request_events_updated BEFORE UPDATE ON event_management.request_events
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

CREATE TABLE IF NOT EXISTS event_management.request_progress (
  s_no               SERIAL PRIMARY KEY,
  request_id         VARCHAR(100) NOT NULL REFERENCES event_management.request_main(request_id),
  forwarded_from     VARCHAR(255),
  forwarded_to       VARCHAR(255),
  request_status_id  VARCHAR(100) REFERENCES event_management.progress_status(request_status_id),
  created_on         TIMESTAMP DEFAULT now(),
  last_updated_by    VARCHAR(255),
  last_updated_on    TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_progress_status ON event_management.request_progress (request_status_id);
DROP TRIGGER IF EXISTS trg_request_progress_updated ON event_management.request_progress;
CREATE TRIGGER trg_request_progress_updated BEFORE UPDATE ON event_management.request_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_last_updated_on();

-- ============================================================================
-- DYNAMIC PER-DEPARTMENT STUDENT TABLES  (user_student_<dept>)
-- ============================================================================
-- Kept as a dynamic-table-per-department pattern per your instruction.
-- Tables are NOT created here — they're created on demand by the
-- ensure_student_table(p_department_name) function in
-- db/functions/event_management/f_ensure_student_table.sql, which both the
-- admin and advisor student-creation flows call before inserting.
--
-- IMPORTANT FIX vs. the MySQL version: the old code had TWO different naming
-- schemes in use at once — user_student_<dept> (sp_create_student_user) vs.
-- user_student_<batch>_<dept> (sp_get_advisor_students / sp_update_student /
-- sp_promote_year_for_batch) — so students created by one flow were invisible
-- to the others. This migration standardizes on ONE name per department:
--   user_student_<lowercase department_name>
-- with `batch` as a normal filterable column inside that table (it already
-- was, in the working sp_create_student_user schema) rather than encoded in
-- the table name. All functions below use this single convention.
--
-- Column set is a superset covering every column referenced anywhere in the
-- original procedures, plus the Excel template's student columns:
--   s_no, roll_no, registration_no, first_name, last_name, user_name,
--   gender, contact, academic_year_id, department_id, current_year, course,
--   semester, batch, hosteller, student_admission, admission_type,
--   user_profile, course_completed, status, created_on, last_updated_by,
--   last_updated_on
-- ============================================================================
