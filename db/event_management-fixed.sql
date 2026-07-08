-- db/event_management-fixed.sql
-- Fixed Event Management Database Schema
-- This is the CORRECTED version with proper structure for advisor access control

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


-- ============================================================================
-- DATABASE: EVENT_MANAGEMENT (Operational & Academic Data)
-- ============================================================================

DROP DATABASE IF EXISTS `event_management`;
CREATE DATABASE IF NOT EXISTS `event_management` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `event_management`;

-- ============================================================================
-- Table: department
-- ============================================================================

CREATE TABLE IF NOT EXISTS `department` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `department_id` INT NOT NULL UNIQUE,
  `department_name` VARCHAR(255) NOT NULL,
  `department_hod` VARCHAR(255),
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_dept_id` (`department_id`),
  INDEX `idx_department_name` (`department_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Table: academic_year
-- ============================================================================

CREATE TABLE IF NOT EXISTS `academic_year` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `academic_year_id` VARCHAR(50) NOT NULL UNIQUE,
  `academic_year` VARCHAR(255) NOT NULL COMMENT 'eg 2023-2027',
  `department_list` JSON,
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_academic_year_id` (`academic_year_id`),
  INDEX `idx_academic_year` (`academic_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Table: user_role
-- ============================================================================

CREATE TABLE IF NOT EXISTS `user_role` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `user_role_id` VARCHAR(50) NOT NULL UNIQUE,
  `user_role` VARCHAR(255) NOT NULL,
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_user_role_id` (`user_role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Table: user_faculty (Advisors, Faculty)
-- ============================================================================
-- IMPORTANT: Added 'batch' field for advisor context lookup

CREATE TABLE IF NOT EXISTS `user_faculty` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `faculty_id` VARCHAR(255) NOT NULL UNIQUE,
  `first_name` VARCHAR(255),
  `last_name` VARCHAR(255),
  `user_name` VARCHAR(255) NOT NULL,
  `gender` VARCHAR(50),
  `contact` VARCHAR(20),
  `user_role_id` VARCHAR(50),
  `academic_year_id` VARCHAR(50),
  `department_id` INT NOT NULL,
  `current_year` INT NOT NULL COMMENT 'Year advisor is assigned to (e.g., 3 for Third Year)',
  `batch` VARCHAR(50) NOT NULL COMMENT 'Batch/Cohort (e.g., 2023)',
  `user_profile` VARCHAR(255),
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_faculty_id` (`faculty_id`),
  INDEX `idx_user_name` (`user_name`),
  INDEX `idx_department_id` (`department_id`),
  INDEX `idx_dept_year_batch` (`department_id`, `current_year`, `batch`),
  INDEX `idx_user_role_id` (`user_role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS: user_faculty
-- ============================================================================

ALTER TABLE `user_faculty`
ADD CONSTRAINT `fk_faculty_role`
FOREIGN KEY (`user_role_id`)
REFERENCES `user_role`(`user_role_id`);

ALTER TABLE `user_faculty`
ADD CONSTRAINT `fk_faculty_dept`
FOREIGN KEY (`department_id`)
REFERENCES `department`(`department_id`);

ALTER TABLE `user_faculty`
ADD CONSTRAINT `fk_faculty_year`
FOREIGN KEY (`academic_year_id`)
REFERENCES `academic_year`(`academic_year_id`);

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- 1. Insert departments (Using Official 3-Digit IDs)
INSERT INTO `department` (`department_id`, `department_name`, `department_hod`) 
VALUES 
  (102, 'AUTO', 'Dr. AUTO HOD'),
  (103, 'CIVIL', 'Dr. CIVIL HOD'),
  (104, 'CSE', 'Dr. CSE HOD'),
  (105, 'EEE', 'Dr. EEE HOD'),
  (106, 'ECE', 'Dr. ECE HOD'),
  (114, 'MECH', 'Dr. MECH HOD'),
  (205, 'IMT', 'Dr. IMT HOD'),
  (243, 'DS', 'Dr. DS HOD')
ON DUPLICATE KEY UPDATE `department_name`=VALUES(`department_name`), `department_hod`=VALUES(`department_hod`);

-- 2. Insert academic years with the JSON department lists
INSERT INTO `academic_year` (`academic_year_id`, `academic_year`, `department_list`) 
VALUES 
  ('AY2021', '2021-2025', '[102, 103, 104, 105, 106, 114, 205]'),
  ('AY2022', '2022-2026', '[102, 103, 104, 105, 106, 114, 205]'),
  ('AY2023', '2023-2027', '[102, 103, 104, 105, 106, 114, 205]'),
  ('AY2024', '2024-2028', '[102, 103, 104, 105, 106, 114, 205]'),
  ('AY2025', '2025-2029', '[102, 103, 104, 105, 106, 114, 205, 243]')
ON DUPLICATE KEY UPDATE `academic_year`=VALUES(`academic_year`), `department_list`=VALUES(`department_list`);

-- 3. Insert user roles
INSERT INTO `user_role` (`user_role_id`, `user_role`) 
VALUES 
  ('R01', 'STUDENT'),
  ('R02', 'FACULTY'),
  ('R03', 'ADVISOR'),
  ('R04', 'HOD'),
  ('R05', 'PRINCIPAL'),
  ('R06', 'PLACEMENT'),
  ('R07', 'SPORTS')
ON DUPLICATE KEY UPDATE `user_role`=VALUES(`user_role`);

-- 4. Insert test advisor in user_faculty 
-- Note: department_id changed to 104 to match the new CSE ID
INSERT INTO `user_faculty` 
  (`faculty_id`, `first_name`, `last_name`, `user_name`, `gender`, `user_role_id`, `academic_year_id`, `department_id`, `current_year`, `batch`) 
VALUES 
  ('FAC001', 'Vasuki', 'Advisor', 'vasuki', 'Female', 'R03', 'AY2023', 104, 3, '2023')
ON DUPLICATE KEY UPDATE `first_name`=VALUES(`first_name`), `last_name`=VALUES(`last_name`);

-- ============================================================================
-- FOR LATER USE: Optional Tables (Commented Out)
-- Uncomment when you need these features
-- ============================================================================

/*
-- Table: course
CREATE TABLE IF NOT EXISTS `course` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `course_id` VARCHAR(100) NOT NULL UNIQUE,
  `course_name` VARCHAR(255) NOT NULL,
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_course_id` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: event_level
CREATE TABLE IF NOT EXISTS `event_level` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `event_level_id` VARCHAR(100) NOT NULL UNIQUE,
  `event_level` VARCHAR(255),
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_event_level_id` (`event_level_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: event_organizer
CREATE TABLE IF NOT EXISTS `event_organizer` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `event_organizer_id` VARCHAR(100) NOT NULL UNIQUE,
  `organizer` VARCHAR(255),
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_event_organizer_id` (`event_organizer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: request_type
CREATE TABLE IF NOT EXISTS `request_type` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `request_type_id` VARCHAR(100) NOT NULL UNIQUE,
  `request_type` VARCHAR(255),
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_request_type_id` (`request_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: progress_status
CREATE TABLE IF NOT EXISTS `progress_status` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `request_status_id` VARCHAR(100) NOT NULL UNIQUE,
  `request_status` VARCHAR(255),
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_request_status_id` (`request_status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: request_main
CREATE TABLE IF NOT EXISTS `request_main` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `request_id` VARCHAR(100) NOT NULL UNIQUE,
  `request_from` VARCHAR(255),
  `request_to` VARCHAR(255),
  `request_type_id` VARCHAR(100),
  `request_status_id` VARCHAR(100),
  `academic_year_id` VARCHAR(100),
  `department_id` INT,
  `course_id` VARCHAR(100),
  `current_year` INT,
  `semester` INT,
  `request_reason` VARCHAR(500),
  `date` DATE,
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_request_id` (`request_id`),
  INDEX `idx_request_status_id` (`request_status_id`),
  INDEX `idx_department_id` (`department_id`),
  INDEX `idx_course_id` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: request_events
CREATE TABLE IF NOT EXISTS `request_events` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `request_id` VARCHAR(100) NOT NULL UNIQUE,
  `event_name` VARCHAR(255),
  `event_level_id` VARCHAR(100),
  `event_organizer_id` VARCHAR(100),
  `notes` VARCHAR(500),
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_request_id` (`request_id`),
  INDEX `idx_event_level_id` (`event_level_id`),
  INDEX `idx_event_organizer_id` (`event_organizer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: request_progress
CREATE TABLE IF NOT EXISTS `request_progress` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `request_id` VARCHAR(100) NOT NULL UNIQUE,
  `forwarded_from` VARCHAR(255),
  `forwarded_to` VARCHAR(255),
  `request_status_id` VARCHAR(100),
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_updated_by` VARCHAR(255),
  `last_updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_request_id` (`request_id`),
  INDEX `idx_request_status_id` (`request_status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
*/

-- ============================================================================
-- CROSS-DATABASE REFERENTIAL INTEGRITY (Application-Level)
-- ============================================================================
-- ⚠️ NOTE: MySQL does NOT support native foreign keys across databases.
--
-- WORKAROUND: The application must enforce these constraints at the code level:
-- 
-- 1. user_faculty.user_name → credentials.table_login.user_name
--    Before inserting into user_faculty, verify user_name exists in table_login
-- 
-- 2. user_student_*.user_name → credentials.table_login.user_name  
--    Before inserting into dynamic student tables, verify user_name exists in table_login
--
-- Implementation in Node.js:
--   - authPool.query("SELECT user_name FROM table_login WHERE user_name = ?", [username])
--   - Throw error if user not found in credentials DB before inserting into event_management DB
--
-- This is already implemented in backend/src/services/admin.service.js
-- See: createUsersService() and getUsersService() functions

COMMIT;

