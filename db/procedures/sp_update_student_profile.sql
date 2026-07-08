-- db/procedures/sp_update_student_profile.sql
-- Stored Procedure: sp_update_student_profile
-- Purpose: Find the student's dynamic table and update their editable profile fields.
-- Database: event_management

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_update_student_profile`$$
CREATE PROCEDURE `sp_update_student_profile`(
  IN  p_username        VARCHAR(255),
  IN  p_first_name      VARCHAR(255),
  IN  p_last_name       VARCHAR(255),
  IN  p_registration_no VARCHAR(100),
  IN  p_gender          VARCHAR(50),
  OUT p_success         TINYINT(1),
  OUT p_message         VARCHAR(255)
)
proc_label: BEGIN
  DECLARE v_table_name VARCHAR(255) DEFAULT NULL;
  DECLARE v_done INT DEFAULT 0;

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
    GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
    SET p_success = 0;
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
      -- Found the student — update their profile
      SET @update_sql = CONCAT(
        'UPDATE `', v_table_name, '` SET ',
        '`first_name` = ?, ',
        '`last_name` = ?, ',
        '`registration_no` = ?, ',
        '`gender` = ?, ',
        '`last_updated_by` = ? ',
        'WHERE `user_name` = ?'
      );
      PREPARE update_stmt FROM @update_sql;
      SET @p_first = p_first_name;
      SET @p_last = p_last_name;
      SET @p_reg = p_registration_no;
      SET @p_gender = p_gender;
      SET @p_updater = p_username;
      SET @p_uname2 = p_username;
      EXECUTE update_stmt USING @p_first, @p_last, @p_reg, @p_gender, @p_updater, @p_uname2;
      DEALLOCATE PREPARE update_stmt;

      CLOSE cur_tables;

      SET p_success = 1;
      SET p_message = 'Profile updated successfully';
      LEAVE proc_label;
    END IF;
  END LOOP;

  CLOSE cur_tables;

  -- Student not found in any table
  SET p_success = 0;
  SET p_message = 'Student profile not found';

END$$

DELIMITER ;
