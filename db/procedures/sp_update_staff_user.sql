-- db/procedures/sp_update_staff_user.sql
-- Stored Procedure: sp_update_staff_user
-- Purpose: Update editable fields of a staff user in user_faculty.
--          faculty_id is immutable (never changed).
--          updated_by is captured from the logged-in admin's session.
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → updateStaffService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_update_staff_user`$$
CREATE PROCEDURE `sp_update_staff_user`(
  IN  p_faculty_id    VARCHAR(50),    -- immutable — used as WHERE key
  IN  p_first_name    VARCHAR(255),   -- NULL = keep existing
  IN  p_last_name     VARCHAR(255),   -- NULL = keep existing
  IN  p_department_id INT,            -- NULL = keep existing
  IN  p_batch         VARCHAR(50),    -- NULL = keep existing
  IN  p_current_year  INT,            -- NULL = keep existing
  IN  p_role_id       VARCHAR(50),    -- NULL = keep existing (user_role_id in user_role table)
  IN  p_updated_by    VARCHAR(255),   -- logged-in admin username (required)
  OUT p_success       TINYINT(1),
  OUT p_message       VARCHAR(500)
)
proc_label: BEGIN
  DECLARE v_count      INT DEFAULT 0;
  DECLARE v_dept_count INT DEFAULT 0;
  DECLARE v_role_count INT DEFAULT 0;

  -- ── 1. Verify faculty exists ───────────────────────────────────────────────
  SELECT COUNT(*) INTO v_count
  FROM `user_faculty`
  WHERE `faculty_id` = p_faculty_id;

  IF v_count = 0 THEN
    SET p_success = 0;
    SET p_message = CONCAT('Staff not found: "', p_faculty_id, '"');
    LEAVE proc_label;
  END IF;

  -- ── 2. Validate department if being changed ────────────────────────────────
  IF p_department_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dept_count
    FROM `department`
    WHERE `department_id` = p_department_id;

    IF v_dept_count = 0 THEN
      SET p_success = 0;
      SET p_message = CONCAT('Department not found: id=', p_department_id);
      LEAVE proc_label;
    END IF;
  END IF;

  -- ── 3. Validate role if being changed ─────────────────────────────────────
  IF p_role_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_role_count
    FROM `user_role`
    WHERE `user_role_id` = p_role_id;

    IF v_role_count = 0 THEN
      SET p_success = 0;
      SET p_message = CONCAT('Role not found: id=', p_role_id);
      LEAVE proc_label;
    END IF;
  END IF;

  -- ── 4. Apply partial update (NULL = keep existing value) ──────────────────
  UPDATE `user_faculty`
  SET
    `first_name`      = COALESCE(p_first_name,    `first_name`),
    `last_name`       = COALESCE(p_last_name,     `last_name`),
    `department_id`   = COALESCE(p_department_id, `department_id`),
    `batch`           = COALESCE(p_batch,         `batch`),
    `current_year`    = COALESCE(p_current_year,  `current_year`),
    `user_role_id`    = COALESCE(p_role_id,       `user_role_id`),
    `last_updated_by` = p_updated_by,
    `last_updated_on` = NOW()
  WHERE `faculty_id` = p_faculty_id;

  SET p_success = 1;
  SET p_message = CONCAT('Staff updated successfully: ', p_faculty_id);
END$$

DELIMITER ;
