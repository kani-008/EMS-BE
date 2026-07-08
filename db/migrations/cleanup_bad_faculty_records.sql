-- db/migrations/cleanup_bad_faculty_records.sql
-- Migration: Clean up bad/garbage data in user_faculty and credentials.table_login

-- 1. Preview table_login records that will be deleted
SELECT 
    'table_login (credentials)' AS table_source,
    user_name, 
    user_role_id, 
    status, 
    last_updated_by
FROM credentials.table_login 
WHERE user_name IN (
    SELECT user_name 
    FROM event_management.user_faculty 
    WHERE faculty_id NOT REGEXP '^FAC[0-9]+$' OR faculty_id = 'FAC2'
);

-- 2. Preview user_faculty records that will be deleted
SELECT 
    'user_faculty (event_management)' AS table_source,
    faculty_id, 
    user_name, 
    first_name, 
    last_name, 
    user_role_id, 
    batch
FROM event_management.user_faculty 
WHERE faculty_id NOT REGEXP '^FAC[0-9]+$' OR faculty_id = 'FAC2';

-- 3. Delete from credentials.table_login FIRST to avoid orphan auth rows
DELETE FROM credentials.table_login 
WHERE user_name IN (
    SELECT user_name 
    FROM event_management.user_faculty 
    WHERE faculty_id NOT REGEXP '^FAC[0-9]+$' OR faculty_id = 'FAC2'
);

-- 4. Delete from event_management.user_faculty
DELETE FROM event_management.user_faculty 
WHERE faculty_id NOT REGEXP '^FAC[0-9]+$' OR faculty_id = 'FAC2';
