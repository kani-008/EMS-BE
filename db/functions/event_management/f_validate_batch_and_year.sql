-- Function: sp_validate_batch_and_year
-- Purpose: Validate a batch year and derive the current academic year.
-- Database: event_management
-- Node call:  SELECT * FROM sp_validate_batch_and_year($1,$2,$3);

DROP FUNCTION IF EXISTS sp_validate_batch_and_year(INT, VARCHAR, INT);

CREATE OR REPLACE FUNCTION sp_validate_batch_and_year(
  p_batch INT,
  p_course VARCHAR,
  p_current_calendar_year INT,
  OUT p_is_valid BOOLEAN,
  OUT p_current_year INT,
  OUT p_message VARCHAR
) AS $$
DECLARE
  v_course_duration INT;
  v_derived_year    INT;
BEGIN
  v_course_duration := CASE WHEN UPPER(TRIM(p_course)) = 'M.E' THEN 2 ELSE 4 END;
  v_derived_year := p_current_calendar_year - p_batch + 1;

  IF v_derived_year < 1 THEN
    p_is_valid := FALSE;
    p_current_year := 0;
    p_message := format(
      'Batch %s is in the future — students have not joined yet. The earliest valid batch for the current year (%s) is %s.',
      p_batch, p_current_calendar_year, p_current_calendar_year
    );
  ELSIF v_derived_year > v_course_duration THEN
    p_is_valid := FALSE;
    p_current_year := 0;
    p_message := format(
      'Batch %s would be in Year %s but %s has a maximum duration of %s years. Students from this batch have already graduated.',
      p_batch, v_derived_year, p_course, v_course_duration
    );
  ELSE
    p_is_valid := TRUE;
    p_current_year := v_derived_year;
    p_message := 'Valid';
  END IF;
END;
$$ LANGUAGE plpgsql;
