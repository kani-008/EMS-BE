-- db/procedures/sp_promote_year_for_batch.sql
-- Stored Procedure: sp_promote_year_for_batch
-- Purpose: Promote all active students of a batch by 1 year or deactivate them if they pass out.
-- Database: event_management

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_promote_year_for_batch`$$
CREATE PROCEDURE `sp_promote_year_for_batch`(
  IN  p_batch           VARCHAR(50),
  IN  p_department_name VARCHAR(255),
  OUT p_success         TINYINT(1),
  OUT p_message         VARCHAR(500),
  OUT p_affected_count  INT
)
proc_label: BEGIN
  DECLARE v_table_name    VARCHAR(255) DEFAULT NULL;
  DECLARE v_exists        INT          DEFAULT 0;
  DECLARE v_course        VARCHAR(100) DEFAULT NULL;
  DECLARE v_course_duration INT        DEFAULT 4;

  -- EXIT HANDLER
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
    SET p_success = 0;
    SET p_affected_count = 0;
  END;

  -- 1. Build table name
  SET v_table_name = CONCAT('user_student_', p_batch, '_', LOWER(p_department_name));

  -- 2. Check table exists
  SELECT COUNT(*) INTO v_exists
  FROM information_schema.tables
  WHERE table_schema = 'event_management'
    AND table_name = v_table_name;

  IF v_exists = 0 THEN
    SET p_success        = 0;
    SET p_message        = 'Student table not found';
    SET p_affected_count = 0;
    LEAVE proc_label;
  END IF;

  -- 3. Get course_duration from user_faculty
  SELECT DISTINCT course INTO v_course
  FROM `user_faculty` uf
  INNER JOIN `department` d ON uf.department_id = d.department_id
  WHERE uf.batch = p_batch
    AND UPPER(d.department_name) = UPPER(p_department_name)
  LIMIT 1;

  IF v_course IS NULL THEN
    SET v_course = 'B.E'; -- fallback
  END IF;

  SET v_course_duration = IF(v_course = 'M.E', 2, 4);

  -- 4. Get current MAX(current_year) of ACTIVE students in the table
  SET @v_max_year = 0;
  SET @max_year_sql = CONCAT('SELECT COALESCE(MAX(current_year), 0) INTO @v_max_year FROM `', v_table_name, '` WHERE status = ''ACTIVE''');
  PREPARE max_year_stmt FROM @max_year_sql;
  EXECUTE max_year_stmt;
  DEALLOCATE PREPARE max_year_stmt;

  -- 5. Promote or Deactivate
  IF @v_max_year = 0 THEN
    SET p_success        = 1;
    SET p_message        = 'No active students found in the table';
    SET p_affected_count = 0;
    LEAVE proc_label;
  END IF;

  IF @v_max_year + 1 > v_course_duration THEN
    -- Deactivate
    SET @update_sql = CONCAT('UPDATE `', v_table_name, '` SET status = ''INACTIVE'' WHERE status = ''ACTIVE''');
    PREPARE update_stmt FROM @update_sql;
    EXECUTE update_stmt;
    SET p_affected_count = ROW_COUNT();
    DEALLOCATE PREPARE update_stmt;
    
    SET p_message = 'Batch passed out — students deactivated';
  ELSE
    -- Promote
    SET @update_sql = CONCAT('UPDATE `', v_table_name, '` SET current_year = current_year + 1 WHERE status = ''ACTIVE''');
    PREPARE update_stmt FROM @update_sql;
    EXECUTE update_stmt;
    SET p_affected_count = ROW_COUNT();
    DEALLOCATE PREPARE update_stmt;

    SET p_message = CONCAT('Promoted to year ', @v_max_year + 1);
  END IF;

  SET p_success = 1;

END$$

DELIMITER ;
