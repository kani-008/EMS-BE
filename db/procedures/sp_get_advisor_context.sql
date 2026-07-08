-- db/procedures/sp_get_advisor_context.sql
-- Stored Procedure: sp_get_advisor_context
-- Purpose: Fetch advisor's assigned department_id, department_name, batch,
--          current_year, and course from user_faculty.
--          Study year is calculated dynamically: YEAR(NOW()) - batch.
--          This value is NEVER stored statically.
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → createUsersService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_advisor_context`$$
CREATE PROCEDURE `sp_get_advisor_context`(IN p_advisor_username VARCHAR(255))
BEGIN
  DECLARE v_batch VARCHAR(50) DEFAULT NULL;
  DECLARE v_course VARCHAR(100) DEFAULT NULL;
  DECLARE v_course_duration INT DEFAULT 4;
  DECLARE v_years_completed INT DEFAULT 0;
  DECLARE v_derived_semester INT DEFAULT 0;

  -- Get advisor's batch and course
  SELECT batch, course INTO v_batch, v_course
  FROM `user_faculty`
  WHERE `user_name` = p_advisor_username
  LIMIT 1;

  IF v_batch IS NULL THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Advisor context not found';
  END IF;

  -- Determine course duration
  SET v_course_duration = IF(UPPER(TRIM(v_course)) = 'M.E', 2, 4);

  -- Determine completed years
  SET v_years_completed = YEAR(CURDATE()) - CAST(v_batch AS UNSIGNED);

  -- Determine derived semester
  IF MONTH(CURDATE()) >= 7 THEN
    SET v_derived_semester = (v_years_completed * 2) + 1;
  ELSE
    SET v_derived_semester = (v_years_completed * 2);
  END IF;

  -- Validate range
  IF v_derived_semester < 1 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Batch not yet started';
  END IF;

  IF v_derived_semester > (v_course_duration * 2) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Batch passed out';
  END IF;

  -- Select everything
  SELECT
    uf.`department_id`,
    d.`department_name`,
    uf.`batch`,
    uf.`current_year`,
    uf.`course`,
    (YEAR(CURDATE()) - CAST(uf.`batch` AS UNSIGNED)) AS study_year,
    v_derived_semester AS derived_semester
  FROM `user_faculty` uf
  INNER JOIN `department` d ON uf.`department_id` = d.`department_id`
  WHERE uf.`user_name` = p_advisor_username
  LIMIT 1;
END$$

DELIMITER ;
