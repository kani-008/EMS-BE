-- db/procedures/sp_get_student_profile.sql
-- Stored Procedure: sp_get_student_profile
-- Purpose: Find a student's profile by scanning all dynamic user_student_% tables.
-- Database: event_management

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_student_profile`$$
CREATE PROCEDURE `sp_get_student_profile`(IN p_username VARCHAR(255))
proc_label: BEGIN
  DECLARE v_table_name VARCHAR(255) DEFAULT NULL;
  DECLARE v_done INT DEFAULT 0;
  DECLARE v_found INT DEFAULT 0;

  -- Cursor over all student tables
  DECLARE cur_tables CURSOR FOR
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'event_management'
      AND table_name LIKE 'user\_student\_%';

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  -- EXIT HANDLER for real SQL exceptions
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    -- Return empty on error
    SELECT NULL AS roll_no LIMIT 0;
  END;

  OPEN cur_tables;

  read_loop: LOOP
    FETCH cur_tables INTO v_table_name;
    IF v_done THEN
      LEAVE read_loop;
    END IF;

    -- Check if student exists in this table
    SET @check_sql = CONCAT('SELECT COUNT(*) INTO @v_found FROM `', v_table_name, '` WHERE `user_name` = ?');
    PREPARE check_stmt FROM @check_sql;
    SET @p_uname = p_username;
    EXECUTE check_stmt USING @p_uname;
    DEALLOCATE PREPARE check_stmt;

    IF @v_found > 0 THEN
      -- Found the student — select their full profile with department join
      SET @select_sql = CONCAT(
        'SELECT s.roll_no, s.user_name, s.first_name, s.last_name, s.gender, ',
        's.registration_no, s.course, s.current_year, s.semester, s.batch, ',
        'd.department_name, s.academic_year_id, s.status, s.created_on, s.last_updated_by ',
        'FROM `', v_table_name, '` s ',
        'LEFT JOIN `department` d ON s.department_id = d.department_id ',
        'WHERE s.user_name = ? LIMIT 1'
      );
      PREPARE select_stmt FROM @select_sql;
      EXECUTE select_stmt USING @p_uname;
      DEALLOCATE PREPARE select_stmt;

      CLOSE cur_tables;
      LEAVE proc_label;
    END IF;
  END LOOP;

  CLOSE cur_tables;

  -- If we reach here, student was not found — return empty result
  SELECT NULL AS roll_no LIMIT 0;

END$$

DELIMITER ;
