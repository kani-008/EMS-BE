-- db/procedures/sp_update_staff_profile.sql
-- Stored Procedure: sp_update_staff_profile
-- Purpose: Allow a staff member to update their own contact number.
--          Only the contact field is editable by staff — all other fields are admin-set.
-- Database: event_management
-- Called by: backend/src/services/staff.service.js → updateStaffProfileService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_update_staff_profile`$$
CREATE PROCEDURE `sp_update_staff_profile`(
  IN  p_username   VARCHAR(255),
  IN  p_contact    VARCHAR(50),
  IN  p_updated_by VARCHAR(255),
  OUT p_success    TINYINT(1),
  OUT p_message    VARCHAR(255)
)
BEGIN
  DECLARE v_exists INT DEFAULT 0;

  -- Verify the staff record exists
  SELECT COUNT(*) INTO v_exists
  FROM user_faculty
  WHERE user_name = p_username;

  IF v_exists = 0 THEN
    SET p_success = 0;
    SET p_message = CONCAT('Staff user not found: "', p_username, '"');
  ELSE
    UPDATE user_faculty
    SET
      contact          = p_contact,
      last_updated_by  = p_updated_by
    WHERE user_name = p_username;

    SET p_success = 1;
    SET p_message = 'Profile updated successfully';
  END IF;
END$$

DELIMITER ;
