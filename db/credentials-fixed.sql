-- db/credentials-fixed.sql
-- Fixed Credentials Database Schema
-- This is the CORRECTED version with proper data types and constraints

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- ============================================================================
-- DATABASE: CREDENTIALS (Authentication Only)
-- ============================================================================

DROP DATABASE IF EXISTS `credentials`;
CREATE DATABASE IF NOT EXISTS `credentials` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `credentials`;

-- ============================================================================
-- Table: table_login (User authentication and role assignment)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `table_login` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `user_name` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL COMMENT 'bcrypt hash (60+ characters)',
  `user_role_id` VARCHAR(50),
  `department_id` INT,
  `status` VARCHAR(50) DEFAULT 'ACTIVE',
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  INDEX `idx_user_name` (`user_name`),
  INDEX `idx_department_id` (`department_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SAMPLE DATA - Test Users for Development
-- ============================================================================

-- ============================================================================
-- Table: table_role (Admin-side role reference — credentials DB only)
-- R08 = ADMIN is not in event_management.user_role, so we define it here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `table_role` (
  `role_id`   VARCHAR(10)  NOT NULL,
  `role_name` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO credentials.table_role (role_id, role_name)
VALUES ('R08', 'ADMIN')
ON DUPLICATE KEY UPDATE role_name = VALUES(role_name);

-- Advisor (vasuki, role R03 = ADVISOR, department CSE → department_id = 104)
-- Password: vasuki123
INSERT INTO credentials.table_login 
  (user_name, password, user_role_id, department_id, status)
VALUES 
  ('vasuki', 
   '$2b$12$GrnKm.4wcVTd8mh0vXIVa.2tHUYJJVLSwydxz0GoNSGBingYloDxq', 
   'R03', 
   104, 
   'ACTIVE');

-- Admin (admin1, role R08 = ADMIN, no department → department_id = NULL)
-- Password: admin123
INSERT INTO credentials.table_login 
  (user_name, password, user_role_id, department_id, status)
VALUES 
  ('admin1', 
   '$2b$12$tmt.3URaxFR3kbVQZcgdheYP9J6/iYLWXsfJvXvIUzTr8PnqRdLSi', 
   'R08', 
   NULL, 
   'ACTIVE');

-- Student (student001, role R01 = STUDENT, department CSE → department_id = 104)
-- Password: student001
INSERT INTO credentials.table_login 
  (user_name, password, user_role_id, department_id, status)
VALUES 
  ('student001', 
   '$2b$12$.gK3QGC7T.lrdMDTgNlZTe.iEOQaizhQki/oX9J6e4Yizy6l5YQBu', 
   'R01', 
   104, 
   'ACTIVE');

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
