-- db/procedures/sp_validate_batch_and_year.sql
-- Stored Procedure: sp_validate_batch_and_year
-- Purpose: Validate a batch year and derive the current academic year for a given course.
--          Returns whether the batch is valid and the derived current year.
--          B.E = 4-year programme, M.E = 2-year programme.
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → validateBatchService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_validate_batch_and_year`$$
CREATE PROCEDURE `sp_validate_batch_and_year`(
  IN  p_batch                INT,           -- e.g. 2023
  IN  p_course               VARCHAR(10),   -- 'B.E' or 'M.E'
  IN  p_current_calendar_year INT,          -- server-side current year, e.g. 2026
  OUT p_is_valid             TINYINT(1),
  OUT p_current_year         INT,
  OUT p_message              VARCHAR(255)
)
BEGIN
  DECLARE v_course_duration INT;
  DECLARE v_derived_year    INT;

  -- Determine course duration: M.E = 2 years, everything else (B.E) = 4 years
  SET v_course_duration = IF(UPPER(TRIM(p_course)) = 'M.E', 2, 4);

  -- Derive current academic year: year 1 = batch year, year N = batch + N - 1
  SET v_derived_year = p_current_calendar_year - p_batch + 1;

  IF v_derived_year < 1 THEN
    SET p_is_valid     = 0;
    SET p_current_year = 0;
    SET p_message      = CONCAT(
      'Batch ', p_batch,
      ' is in the future — students have not joined yet. ',
      'The earliest valid batch for the current year (', p_current_calendar_year,
      ') is ', p_current_calendar_year, '.'
    );
  ELSEIF v_derived_year > v_course_duration THEN
    SET p_is_valid     = 0;
    SET p_current_year = 0;
    SET p_message      = CONCAT(
      'Batch ', p_batch, ' would be in Year ', v_derived_year,
      ' but ', p_course, ' has a maximum duration of ', v_course_duration,
      ' years. Students from this batch have already graduated.'
    );
  ELSE
    SET p_is_valid     = 1;
    SET p_current_year = v_derived_year;
    SET p_message      = 'Valid';
  END IF;
END$$

DELIMITER ;
