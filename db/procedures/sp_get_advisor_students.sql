-- db/procedures/sp_get_advisor_students.sql
-- Stored Procedure: sp_get_advisor_students
-- Purpose: Get all student records for the advisor's batch and department.
-- Database: event_management

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_advisor_students`$$
CREATE PROCEDURE `sp_get_advisor_students`(IN p_advisor_username VARCHAR(255))
proc_label: BEGIN
  DECLARE v_dept_name  VARCHAR(255) DEFAULT NULL;
  DECLARE v_batch      VARCHAR(50)  DEFAULT NULL;
  DECLARE v_table_name VARCHAR(255) DEFAULT NULL;
  DECLARE v_exists     INT          DEFAULT 0;

  -- EXIT HANDLER
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    -- Return empty result on exception
    SELECT NULL LIMIT 0;
  END;

  -- 1. Get advisor context
  SELECT d.department_name, uf.batch
  INTO v_dept_name, v_batch
  FROM `user_faculty` uf
  INNER JOIN `department` d ON uf.department_id = d.department_id
  WHERE uf.user_name = p_advisor_username
  LIMIT 1;

  IF v_dept_name IS NULL OR v_batch IS NULL THEN
    LEAVE proc_label;
  END IF;

  -- 2. Build table name
  SET v_table_name = CONCAT('user_student_', v_batch, '_', LOWER(v_dept_name));

  -- 3. Check if table exists in information_schema
  SELECT COUNT(*) INTO v_exists
  FROM information_schema.tables
  WHERE table_schema = 'event_management'
    AND table_name = v_table_name;

  IF v_exists = 0 THEN
    -- Return empty result set
    SET @empty_sql = CONCAT('SELECT * FROM `department` WHERE 1=0');
    PREPARE empty_stmt FROM @empty_sql;
    EXECUTE empty_stmt;
    DEALLOCATE PREPARE empty_stmt;
  ELSE
    -- Select all columns from that table joined with department to get department_name ORDER BY created_on DESC
    SET @select_sql = CONCAT(
      'SELECT s.*, d.department_name ',
      'FROM `', v_table_name, '` s ',
      'LEFT JOIN `department` d ON s.department_id = d.department_id ',
      'ORDER BY s.created_on DESC'
    );
    PREPARE select_stmt FROM @select_sql;
    EXECUTE select_stmt;
    DEALLOCATE PREPARE select_stmt;
  END IF;

END$$

DELIMITER ;
