-- db/procedures/sp_create_staff_user.sql
-- Stored Procedure: sp_create_staff_user
-- Purpose: Create a staff user with an explicit unique username and auto-generated FAC### ID.
--          All validation (role, department) is done here.
--          Credentials DB insert (sp_insert_login) is handled separately by the service.
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → createStaffService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_create_staff_user`$$
CREATE PROCEDURE `sp_create_staff_user`(
  IN  p_username      VARCHAR(255),   -- login username (must be unique)
  IN  p_first_name    VARCHAR(255),
  IN  p_last_name     VARCHAR(255),
  IN  p_gender        VARCHAR(50),
  IN  p_role_name     VARCHAR(255),   -- e.g. 'ADVISOR', 'HOD', 'PRINCIPAL'
  IN  p_department_id INT,            -- NULL allowed for PRINCIPAL
  IN  p_batch         VARCHAR(50),    -- 'N/A' for non-ADVISOR roles
  IN  p_current_year  INT,            -- 0 for non-ADVISOR roles
  IN  p_course        VARCHAR(100),   -- '-' if not applicable
  IN  p_created_by    VARCHAR(255),
  OUT p_success       TINYINT(1),
  OUT p_message       VARCHAR(500),
  OUT p_faculty_id    VARCHAR(50),    -- e.g. FAC101
  OUT p_role_id       VARCHAR(50)     -- e.g. R03
)
proc_label: BEGIN
  DECLARE v_role_id     VARCHAR(50)  DEFAULT NULL;
  DECLARE v_dept_count  INT          DEFAULT 0;
  DECLARE v_uname_count INT          DEFAULT 0;
  DECLARE v_max_seq     INT          DEFAULT 100;  -- default guards against NULL from empty table
  DECLARE v_next_seq    INT;
  DECLARE v_fac_id      VARCHAR(50);
  DECLARE v_batch       VARCHAR(50);
  DECLARE v_course      VARCHAR(100);

  -- EXIT HANDLER FOR SQLEXCEPTION to capture real failure reasons
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
    SET p_success    = 0;
    SET p_faculty_id = NULL;
    SET p_role_id    = NULL;
  END;

  -- 1. Resolve role_id from user_role table (no hardcoding)
  SELECT `user_role_id` INTO v_role_id
  FROM `user_role`
  WHERE UPPER(`user_role`) = UPPER(p_role_name)
  LIMIT 1;

  IF v_role_id IS NULL THEN
    SET p_success    = 0;
    SET p_message    = CONCAT('Invalid role: "', p_role_name, '". Check user_role table.');
    SET p_faculty_id = NULL;
    SET p_role_id    = NULL;
    LEAVE proc_label;
  END IF;

  -- 2. Validate department exists (skip for PRINCIPAL who has no dept)
  IF p_department_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dept_count
    FROM `department`
    WHERE `department_id` = p_department_id;

    IF v_dept_count = 0 THEN
      SET p_success    = 0;
      SET p_message    = CONCAT('Department not found: id=', p_department_id);
      SET p_faculty_id = NULL;
      SET p_role_id    = v_role_id;
      LEAVE proc_label;
    END IF;
  END IF;

  -- 3. Ensure username is unique in user_faculty
  SELECT COUNT(*) INTO v_uname_count
  FROM `user_faculty`
  WHERE `user_name` = p_username;

  IF v_uname_count > 0 THEN
    SET p_success    = 0;
    SET p_message    = CONCAT('Staff username already exists: "', p_username, '"');
    SET p_faculty_id = NULL;
    SET p_role_id    = v_role_id;
    LEAVE proc_label;
  END IF;

  -- 4. Auto-generate sequential faculty_id: FAC101, FAC102, FAC103 …
  --    Always 3-digit minimum via LPAD, starting from 101.
  --    Uses MAX of existing numeric suffixes matching REGEXP to avoid collisions.
  SELECT COALESCE(MAX(CAST(SUBSTRING(`faculty_id`, 4) AS UNSIGNED)), 100)
  INTO   v_max_seq
  FROM   `user_faculty`
  WHERE  `faculty_id` REGEXP '^FAC[0-9]+$';

  -- Ensure minimum sequence starts at 101 (ID always FAC101 or higher, 3-digit padded)
  SET v_next_seq = GREATEST(v_max_seq + 1, 101);
  SET v_fac_id   = CONCAT('FAC', LPAD(v_next_seq, 3, '0'));

  -- Handle unlikely gap collision (concurrent inserts)
  WHILE EXISTS (SELECT 1 FROM `user_faculty` WHERE `faculty_id` = v_fac_id) DO
    SET v_next_seq = v_next_seq + 1;
    SET v_fac_id   = CONCAT('FAC', LPAD(v_next_seq, 3, '0'));
  END WHILE;

  -- 5. Normalise optional fields
  SET v_batch  = IF(p_batch  IS NULL OR TRIM(p_batch)  = '' OR p_batch  = 'N/A',
                    'N/A', TRIM(p_batch));
  SET v_course = IF(p_course IS NULL OR TRIM(p_course) = '',
                    '-', TRIM(p_course));

  -- 6. Insert into user_faculty
  INSERT INTO `user_faculty` (
    `faculty_id`, `user_name`, `first_name`, `last_name`, `gender`,
    `department_id`, `user_role_id`, `current_year`, `batch`, `course`,
    `last_updated_by`
  ) VALUES (
    v_fac_id,
    p_username,
    p_first_name,
    COALESCE(p_last_name, ''),
    COALESCE(p_gender, ''),
    p_department_id,
    v_role_id,
    COALESCE(p_current_year, 0),
    v_batch,
    v_course,
    p_created_by
  );

  SET p_success    = 1;
  SET p_message    = CONCAT('Staff created successfully: ', p_username, ' (', v_fac_id, ')');
  SET p_faculty_id = v_fac_id;
  SET p_role_id    = v_role_id;
END$$

DELIMITER ;
