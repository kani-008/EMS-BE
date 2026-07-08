-- db/procedures/sp_get_staff_profile.sql
-- Stored Procedure: sp_get_staff_profile
-- Purpose: Fetch a staff member's full profile from user_faculty joined with department.
--          Returns all profile fields needed by the staff profile page.
-- Database: event_management
-- Called by: backend/src/services/staff.service.js → getStaffProfileService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_staff_profile`$$
CREATE PROCEDURE `sp_get_staff_profile`(
  IN p_username VARCHAR(255)
)
BEGIN
  SELECT
    uf.faculty_id,
    uf.user_name,
    uf.first_name,
    uf.last_name,
    uf.gender,
    uf.contact,
    uf.department_id,
    d.department_name,
    uf.user_role_id,
    ur.user_role,
    uf.batch,
    uf.course,
    uf.current_year,
    uf.user_profile,
    uf.created_on,
    uf.last_updated_by,
    ay.academic_year_id,
    ay.academic_year
  FROM user_faculty uf
  LEFT JOIN department d  ON uf.department_id  = d.department_id
  LEFT JOIN user_role  ur ON uf.user_role_id   = ur.user_role_id
  LEFT JOIN academic_year ay ON ay.academic_year_id = CONCAT('AY', uf.batch)
  WHERE uf.user_name = p_username
  LIMIT 1;
END$$

DELIMITER ;
