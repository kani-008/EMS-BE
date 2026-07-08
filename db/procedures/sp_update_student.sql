-- db/procedures/sp_update_student.sql
-- Stored Procedure: sp_update_student
-- Purpose: Update student details in the dynamic student table user_student_{batch}_{dept}
-- Database: event_management

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_update_student`$$
CREATE PROCEDURE `sp_update_student`(
  IN  p_advisor_username  VARCHAR(255),
  IN  p_roll_no           VARCHAR(100),
  IN  p_first_name        VARCHAR(255),
  IN  p_last_name         VARCHAR(255),
  IN  p_gender            VARCHAR(50),
  IN  p_registration_no   VARCHAR(100),
  IN  p_course            VARCHAR(100),
  OUT p_success           TINYINT(1),
  OUT p_message           VARCHAR(255)
)
proc_label: BEGIN
  DECLARE v_dept_name     VARCHAR(255) DEFAULT NULL;
  DECLARE v_batch         VARCHAR(50)  DEFAULT NULL;
  DECLARE v_table_name    VARCHAR(255) DEFAULT NULL;
  DECLARE v_table_exists  INT          DEFAULT 0;
  DECLARE v_student_exists INT         DEFAULT 0;

  -- EXIT HANDLER FOR SQLEXCEPTION to capture database exceptions safely
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
    SET p_success = 0;
  END;

  -- 1. Get advisor context
  SELECT d.department_name, uf.batch
  INTO v_dept_name, v_batch
  FROM `user_faculty` uf
  INNER JOIN `department` d ON uf.department_id = d.department_id
  WHERE uf.user_name = p_advisor_username
  LIMIT 1;

  IF v_dept_name IS NULL OR v_batch IS NULL THEN
    SET p_success = 0;
    SET p_message = 'Advisor context not found';
    LEAVE proc_label;
  END IF;

  -- 2. Build dynamic table name
  SET v_table_name = CONCAT('user_student_', v_batch, '_', LOWER(v_dept_name));

  -- 3. Check if table exists in database
  SELECT COUNT(*) INTO v_table_exists
  FROM information_schema.tables
  WHERE table_schema = 'event_management'
    AND table_name = v_table_name;

  IF v_table_exists = 0 THEN
    SET p_success = 0;
    SET p_message = 'Student table does not exist';
    LEAVE proc_label;
  END IF;

  -- 4. Check if student exists in the dynamic table
  SET @check_sql = CONCAT('SELECT COUNT(*) INTO @v_student_exists FROM `', v_table_name, '` WHERE `roll_no` = ?');
  PREPARE check_stmt FROM @check_sql;
  SET @roll_no_param = p_roll_no;
  EXECUTE check_stmt USING @roll_no_param;
  DEALLOCATE PREPARE check_stmt;

  IF @v_student_exists = 0 THEN
    SET p_success = 0;
    SET p_message = 'Student not found in your assigned batch';
    LEAVE proc_label;
  END IF;

  -- 5. Update student record in dynamic table
  SET @update_sql = CONCAT(
    'UPDATE `', v_table_name, '` SET ',
    '  `first_name` = ?, ',
    '  `last_name` = ?, ',
    '  `gender` = ?, ',
    '  `registration_no` = ?, ',
    '  `course` = ?, ',
    '  `last_updated_by` = ? ',
    'WHERE `roll_no` = ?'
  );

  PREPARE update_stmt FROM @update_sql;
  SET @p_first_param = p_first_name;
  SET @p_last_param = p_last_name;
  SET @p_gender_param = p_gender;
  SET @p_reg_param = p_registration_no;
  SET @p_course_param = p_course;
  SET @p_updater_param = p_advisor_username;
  SET @p_roll_no_param = p_roll_no;

  EXECUTE update_stmt USING 
    @p_first_param, @p_last_param, @p_gender_param, @p_reg_param, @p_course_param, @p_updater_param, @p_roll_no_param;
  DEALLOCATE PREPARE update_stmt;

  SET p_success = 1;
  SET p_message = 'Student updated successfully';

END$$

DELIMITER ;
