-- Function: sp_update_student_profile
-- Purpose: Find the student's own department table by scanning all
--          user_student_% tables for their user_name, then update it.
-- Database: event_management
-- Node call:  SELECT * FROM sp_update_student_profile($1,...,$5);

DROP FUNCTION IF EXISTS event_management.sp_update_student_profile(VARCHAR,VARCHAR,VARCHAR,VARCHAR,VARCHAR);

CREATE OR REPLACE FUNCTION event_management.sp_update_student_profile(
  p_username        VARCHAR,
  p_first_name      VARCHAR,
  p_last_name       VARCHAR,
  p_registration_no VARCHAR,
  p_gender          VARCHAR,
  OUT p_success BOOLEAN,
  OUT p_message VARCHAR
) AS $$
DECLARE
  v_table_name RECORD;
  v_found      INT;
BEGIN
  FOR v_table_name IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'event_management' AND table_name LIKE 'user\_student\_%'
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE user_name = $1', v_table_name.table_name)
      INTO v_found USING p_username;

    IF v_found > 0 THEN
      EXECUTE format(
        'UPDATE %I SET first_name=$1, last_name=$2, registration_no=$3, gender=$4, last_updated_by=$5
         WHERE user_name = $6',
        v_table_name.table_name
      ) USING p_first_name, p_last_name, p_registration_no, p_gender, p_username, p_username;

      p_success := TRUE;
      p_message := 'Profile updated successfully';
      RETURN;
    END IF;
  END LOOP;

  p_success := FALSE;
  p_message := 'Student profile not found';
EXCEPTION WHEN OTHERS THEN
  p_success := FALSE; p_message := SQLERRM;
END;
$$ LANGUAGE plpgsql
SET search_path = credentials, event_management, public;
