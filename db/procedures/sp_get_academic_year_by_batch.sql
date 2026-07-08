-- db/procedures/sp_get_academic_year_by_batch.sql
-- Stored Procedure: sp_get_academic_year_by_batch
-- Purpose: Return academic_year_id for a given batch year (year of joining).
--          Academic year range starts at batch year, so '2023' → 'AY2023' (2023-2027).
-- Database: event_management
-- Called by: backend/src/services/admin.service.js → createUsersService

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_get_academic_year_by_batch`$$
CREATE PROCEDURE `sp_get_academic_year_by_batch`(IN p_batch VARCHAR(50))
BEGIN
  -- Match academic_year_id that starts with the batch year prefix
  -- e.g. batch='2023' → academic_year_id='AY2023'
  SELECT
    `academic_year_id`,
    `academic_year`
  FROM `academic_year`
  WHERE `academic_year_id` = CONCAT('AY', p_batch)
  LIMIT 1;
END$$

DELIMITER ;
