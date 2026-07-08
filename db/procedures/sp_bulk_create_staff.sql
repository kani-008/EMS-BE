-- db/procedures/sp_bulk_create_staff.sql
-- Stored Procedure: sp_bulk_create_staff
-- Purpose: Insert a single validated staff row with auto-generated username and FAC### ID.
--          Username is generated from first_name + last_name, ensuring uniqueness.
--          Mirrors sp_create_staff_user but called per-row from the service bulk loop.
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → bulkCreateStaffService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_bulk_create_staff`$$
CREATE PROCEDURE `sp_bulk_create_staff`(
  IN  p_first_name    VARCHAR(255),
  IN  p_last_name     VARCHAR(255),
  IN  p_gender        VARCHAR(50),
  IN  p_role_name     VARCHAR(255),   -- e.g. 'ADVISOR', 'HOD', 'FACULTY'
  IN  p_department_id INT,            -- NULL allowed for PRINCIPAL
  IN  p_batch         VARCHAR(50),    -- 'N/A' for non-ADVISOR
  IN  p_course        VARCHAR(100),   -- '-' if not applicable
  IN  p_current_year  INT,            -- 0 for non-ADVISOR
  IN  p_created_by    VARCHAR(255),
  OUT p_success       TINYINT(1),
  OUT p_message       VARCHAR(500),
  OUT p_username      VARCHAR(255),   -- generated username
  OUT p_faculty_id    VARCHAR(50),
  OUT p_role_id       VARCHAR(50)
)
proc_label: BEGIN
  DECLARE v_role_id     VARCHAR(50)  DEFAULT NULL;
  DECLARE v_dept_count  INT          DEFAULT 0;
  DECLARE v_uname_count INT          DEFAULT 0;
  DECLARE v_max_seq     INT          DEFAULT 100;
  DECLARE v_next_seq    INT;
  DECLARE v_fac_id      VARCHAR(50);
  DECLARE v_batch       VARCHAR(50);
  DECLARE v_course      VARCHAR(100);
  DECLARE v_current_year INT;
  DECLARE v_base_uname  VARCHAR(255);
  DECLARE v_gen_uname   VARCHAR(255);
  DECLARE v_suffix      INT DEFAULT 0;

  -- ── 0. Generate base username from first_name + last_name ──────────────────
  SET v_base_uname = LOWER(CONCAT(p_first_name, COALESCE(p_last_name, '')));
  SET v_base_uname = REGEXP_REPLACE(v_base_uname, '[^a-z0-9]', '');
  
  IF LENGTH(v_base_uname) = 0 THEN
    SET p_success   = 0;
    SET p_message   = 'Cannot generate username from empty first_name and last_name';
    SET p_username  = NULL;
    SET p_faculty_id= NULL;
    SET p_role_id   = NULL;
    LEAVE proc_label;
  END IF;

  -- ── 0b. Ensure unique username ─────────────────────────────────────────────
  SET v_gen_uname = v_base_uname;
  SET v_suffix    = 0;
  
  uname_loop: LOOP
    SELECT COUNT(*) INTO v_uname_count
    FROM `user_faculty`
    WHERE `user_name` = v_gen_uname;
    
    IF v_uname_count = 0 THEN
      LEAVE uname_loop;
    END IF;
    
    SET v_suffix    = v_suffix + 1;
    SET v_gen_uname = CONCAT(v_base_uname, v_suffix);
  END LOOP uname_loop;

  -- ── 1. Resolve role_id ────────────────────────────────────────────────────
  SELECT `user_role_id` INTO v_role_id
  FROM `user_role`
  WHERE UPPER(`user_role`) = UPPER(p_role_name)
  LIMIT 1;

  IF v_role_id IS NULL THEN
    SET p_success    = 0;
    SET p_message    = CONCAT('Invalid role: "', p_role_name, '"');
    SET p_username   = NULL;
    SET p_faculty_id = NULL;
    SET p_role_id    = NULL;
    LEAVE proc_label;
  END IF;

  -- ── 2. Validate department ────────────────────────────────────────────────
  IF p_department_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dept_count
    FROM `department`
    WHERE `department_id` = p_department_id;

    IF v_dept_count = 0 THEN
      SET p_success    = 0;
      SET p_message    = CONCAT('Department not found: id=', p_department_id);
      SET p_username   = NULL;
      SET p_faculty_id = NULL;
      SET p_role_id    = v_role_id;
      LEAVE proc_label;
    END IF;
  END IF;

  -- ── 3. Auto-generate sequential FAC### faculty_id ────────────────────────
  SELECT COALESCE(MAX(CAST(SUBSTRING(`faculty_id`, 4) AS UNSIGNED)), 100)
  INTO   v_max_seq
  FROM   `user_faculty`
  WHERE  `faculty_id` REGEXP '^FAC[0-9]+$';

  SET v_next_seq = GREATEST(v_max_seq + 1, 101);
  SET v_fac_id   = CONCAT('FAC', LPAD(v_next_seq, 3, '0'));

  WHILE EXISTS (SELECT 1 FROM `user_faculty` WHERE `faculty_id` = v_fac_id) DO
    SET v_next_seq = v_next_seq + 1;
    SET v_fac_id   = CONCAT('FAC', LPAD(v_next_seq, 3, '0'));
  END WHILE;

  -- ── 4. Normalise optional fields ──────────────────────────────────────────
  SET v_batch  = IF(p_batch  IS NULL OR TRIM(p_batch)  = '' OR p_batch  = 'N/A',
                    'N/A', TRIM(p_batch));
  SET v_course = IF(p_course IS NULL OR TRIM(p_course) = '',
                    '-', TRIM(p_course));
  SET v_current_year = IF(p_current_year IS NULL OR p_current_year < 0, 0, p_current_year);

  -- ── 5. Insert into user_faculty ───────────────────────────────────────────
  INSERT INTO `user_faculty` (
    `faculty_id`, `user_name`, `first_name`, `last_name`, `gender`,
    `department_id`, `user_role_id`, `batch`, `course`, `current_year`,
    `last_updated_by`
  ) VALUES (
    v_fac_id,
    v_gen_uname,
    p_first_name,
    COALESCE(p_last_name, ''),
    COALESCE(p_gender, ''),
    COALESCE(p_department_id, 0),
    v_role_id,
    v_batch,
    v_course,
    v_current_year,
    p_created_by
  );

  SET p_success    = 1;
  SET p_message    = CONCAT('Created: ', v_gen_uname, ' (', v_fac_id, ')');
  SET p_username   = v_gen_uname;
  SET p_faculty_id = v_fac_id;
  SET p_role_id    = v_role_id;
END$$

DELIMITER ;
