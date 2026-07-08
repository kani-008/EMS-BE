-- db/procedures/sp_create_student.sql
-- Stored Procedure: sp_create_student
-- Purpose: Dynamically create student table user_student_{batch}_{dept} if not exists,
--          then insert a student record.
-- Database: event_management

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_create_student`$$
CREATE PROCEDURE `sp_create_student`(
  IN  p_advisor_username  VARCHAR(255),
  IN  p_roll_no           VARCHAR(100),   -- the single student's roll number
  IN  p_first_name        VARCHAR(255),   -- can be empty string for range/excel if not provided
  IN  p_last_name         VARCHAR(255),
  IN  p_gender            VARCHAR(50),
  IN  p_registration_no   VARCHAR(100),
  IN  p_course            VARCHAR(100),
  IN  p_semester          INT,
  OUT p_success           TINYINT(1),
  OUT p_message           VARCHAR(500),
  OUT p_username          VARCHAR(255),
  OUT p_table_name        VARCHAR(255)
)
proc_label: BEGIN
  DECLARE v_dept_id       INT          DEFAULT NULL;
  DECLARE v_dept_name     VARCHAR(255) DEFAULT NULL;
  DECLARE v_batch         VARCHAR(50)  DEFAULT NULL;
  DECLARE v_advisor_course VARCHAR(100) DEFAULT NULL;
  DECLARE v_current_year  INT          DEFAULT NULL;
  DECLARE v_course_duration INT        DEFAULT 4;
  DECLARE v_academic_year_id VARCHAR(50) DEFAULT NULL;
  DECLARE v_table_name    VARCHAR(255) DEFAULT NULL;

  -- EXIT HANDLER FOR SQLEXCEPTION to capture real database exceptions
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
    SET p_success    = 0;
    SET p_username   = NULL;
    SET p_table_name = NULL;
  END;

  -- 1. Get advisor context
  SELECT uf.department_id, d.department_name, uf.batch, uf.course
  INTO v_dept_id, v_dept_name, v_batch, v_advisor_course
  FROM `user_faculty` uf
  INNER JOIN `department` d ON uf.department_id = d.department_id
  WHERE uf.user_name = p_advisor_username
  LIMIT 1;

  IF v_dept_id IS NULL THEN
    SET p_success    = 0;
    SET p_message    = 'Advisor not found';
    SET p_username   = NULL;
    SET p_table_name = NULL;
    LEAVE proc_label;
  END IF;

  -- 2. Derive and validate current_year
  SET v_current_year = YEAR(CURDATE()) - CAST(v_batch AS UNSIGNED) + 1;
  SET v_course_duration = IF(p_course = 'M.E', 2, 4);

  IF v_current_year < 1 OR v_current_year > v_course_duration THEN
    SET p_success    = 0;
    SET p_message    = 'Batch has passed out or not started';
    SET p_username   = NULL;
    SET p_table_name = NULL;
    LEAVE proc_label;
  END IF;

  -- 3. Get academic_year_id
  SELECT academic_year_id INTO v_academic_year_id
  FROM `academic_year`
  WHERE academic_year_id = CONCAT('AY', v_batch)
  LIMIT 1;

  -- 4. Build table name
  SET v_table_name = CONCAT('user_student_', v_batch, '_', LOWER(v_dept_name));
  SET p_table_name = v_table_name;

  -- 5. Create table dynamically if not exists
  SET @create_sql = CONCAT(
    'CREATE TABLE IF NOT EXISTS `', v_table_name, '` (',
    '  `roll_no` VARCHAR(100) PRIMARY KEY,',
    '  `user_name` VARCHAR(255) NOT NULL UNIQUE,',
    '  `registration_no` VARCHAR(100),',
    '  `first_name` VARCHAR(255),',
    '  `last_name` VARCHAR(255),',
    '  `gender` VARCHAR(50),',
    '  `academic_year_id` VARCHAR(50),',
    '  `department_id` INT,',
    '  `course` VARCHAR(100),',
    '  `current_year` INT,',
    '  `semester` INT,',
    '  `batch` VARCHAR(50),',
    '  `status` VARCHAR(50) DEFAULT ''ACTIVE'',',
    '  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,',
    '  `last_updated_by` VARCHAR(255)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  );

  PREPARE create_stmt FROM @create_sql;
  EXECUTE create_stmt;
  DEALLOCATE PREPARE create_stmt;

  -- 6. Check duplicate in the dynamic table
  SET @dup_count = 0;
  SET @dup_sql = CONCAT('SELECT COUNT(*) INTO @dup_count FROM `', v_table_name, '` WHERE `roll_no` = ?');
  PREPARE dup_stmt FROM @dup_sql;
  SET @roll_no_param = p_roll_no;
  EXECUTE dup_stmt USING @roll_no_param;
  DEALLOCATE PREPARE dup_stmt;

  IF @dup_count > 0 THEN
    SET p_success    = 0;
    SET p_message    = CONCAT('Roll number already exists: ', p_roll_no);
    SET p_username   = NULL;
    LEAVE proc_label;
  END IF;

  -- 7. Insert student record into the dynamic table
  SET p_username = LOWER(p_roll_no);

  SET @insert_sql = CONCAT(
    'INSERT INTO `', v_table_name, '` (',
    '  `roll_no`, `user_name`, `registration_no`, `first_name`, `last_name`, `gender`,',
    '  `academic_year_id`, `department_id`, `course`, `current_year`, `semester`, `batch`,',
    '  `last_updated_by`',
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  PREPARE insert_stmt FROM @insert_sql;
  SET @p_roll_no_param = p_roll_no;
  SET @p_username_param = p_username;
  SET @p_reg_param = p_registration_no;
  SET @p_first_param = p_first_name;
  SET @p_last_param = p_last_name;
  SET @p_gender_param = p_gender;
  SET @p_ay_param = v_academic_year_id;
  SET @p_dept_param = v_dept_id;
  SET @p_course_param = p_course;
  SET @p_year_param = v_current_year;
  SET @p_sem_param = p_semester;
  SET @p_batch_param = v_batch;
  SET @p_updater_param = p_advisor_username;

  EXECUTE insert_stmt USING 
    @p_roll_no_param, @p_username_param, @p_reg_param, @p_first_param, @p_last_param, @p_gender_param,
    @p_ay_param, @p_dept_param, @p_course_param, @p_year_param, @p_sem_param, @p_batch_param,
    @p_updater_param;
  DEALLOCATE PREPARE insert_stmt;

  SET p_success = 1;
  SET p_message = 'Student created';

END$$

DELIMITER ;
