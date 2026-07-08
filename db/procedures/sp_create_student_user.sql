-- db/procedures/sp_create_student_user.sql
-- Stored Procedure: sp_create_student_user
-- Purpose: Insert a student into the department-specific user_student_* table.
--          Enforces advisor's department and batch restrictions from the DB — not from frontend.
--          Credentials DB insert (sp_insert_login) must be called BEFORE this SP by the service.
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → createUsersService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_create_student_user`$$
CREATE PROCEDURE `sp_create_student_user`(
  IN p_advisor_username VARCHAR(255),   -- used to look up advisor's dept + batch
  IN p_roll_no          VARCHAR(255),
  IN p_user_name        VARCHAR(255),
  IN p_academic_year_id VARCHAR(50),
  IN p_department_id    INT,
  IN p_current_year     INT,
  IN p_course           VARCHAR(100),
  IN p_semester         INT,
  IN p_batch            VARCHAR(50),
  IN p_created_by       VARCHAR(255)
)
proc_label: BEGIN
  DECLARE v_advisor_dept  INT          DEFAULT NULL;
  DECLARE v_advisor_batch VARCHAR(50)  DEFAULT NULL;
  DECLARE v_dept_name     VARCHAR(255) DEFAULT NULL;
  DECLARE v_table_name    VARCHAR(255);

  -- ── 1. Fetch advisor's assigned department and batch from user_faculty ─────
  SELECT `department_id`, `batch`
  INTO   v_advisor_dept, v_advisor_batch
  FROM   `user_faculty`
  WHERE  `user_name` = p_advisor_username
  LIMIT  1;

  IF v_advisor_dept IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Advisor not found in system. Only registered advisors can create students.';
  END IF;

  -- ── 2. Enforce department restriction ─────────────────────────────────────
  IF v_advisor_dept != p_department_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Department mismatch: student department does not match advisor assigned department.';
  END IF;

  -- ── 3. Enforce batch restriction ──────────────────────────────────────────
  IF TRIM(v_advisor_batch) != TRIM(p_batch) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Batch mismatch: student batch does not match advisor assigned batch.';
  END IF;

  -- ── 4. Resolve department name for dynamic table name ─────────────────────
  SELECT LOWER(`department_name`) INTO v_dept_name
  FROM   `department`
  WHERE  `department_id` = p_department_id
  LIMIT  1;

  IF v_dept_name IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Department name could not be resolved. Check department table.';
  END IF;

  SET v_table_name = CONCAT('user_student_', v_dept_name);

  -- ── 5. Insert student using dynamic table name (prepared statement) ────────
  SET @sql = CONCAT(
    'INSERT INTO `', v_table_name, '` ',
    '(`roll_no`, `user_name`, `academic_year_id`, `department_id`, `current_year`, ',
    '`course`, `semester`, `batch`, `last_updated_by`) ',
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ',
    'ON DUPLICATE KEY UPDATE `user_name` = `user_name`'
  );

  SET @p1 = p_roll_no;
  SET @p2 = p_user_name;
  SET @p3 = p_academic_year_id;
  SET @p4 = p_department_id;
  SET @p5 = p_current_year;
  SET @p6 = p_course;
  SET @p7 = p_semester;
  SET @p8 = p_batch;
  SET @p9 = p_created_by;

  PREPARE stmt FROM @sql;
  EXECUTE stmt USING @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9;
  DEALLOCATE PREPARE stmt;

  SELECT IF(ROW_COUNT() > 0, 1, 0) AS inserted;
END$$

DELIMITER ;
