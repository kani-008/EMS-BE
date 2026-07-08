-- db/procedures/sp_get_all_users.sql
-- Stored Procedure: sp_get_all_users
-- Purpose: Get all staff/faculty users with roles and departments.
--          Does NOT return students.
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → getUsersService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_all_users`$$
CREATE PROCEDURE `sp_get_all_users`()
BEGIN
    SELECT 
        uf.faculty_id,
        uf.first_name,
        uf.last_name,
        uf.user_name,
        uf.gender,
        d.department_name,
        uf.user_role_id,
        ur.user_role,
        uf.batch,
        uf.course,
        uf.current_year,
        uf.created_on,
        uf.last_updated_by
    FROM `user_faculty` uf
    LEFT JOIN `department` d ON uf.department_id = d.department_id
    LEFT JOIN `user_role` ur ON uf.user_role_id = ur.user_role_id
    ORDER BY uf.created_on DESC;
END$$

DELIMITER ;