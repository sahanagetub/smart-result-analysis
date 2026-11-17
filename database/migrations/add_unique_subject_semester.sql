-- ==============================================================================
-- Migration: Add Unique Constraint on (semester_id, subject_code)
-- Target Table: subjects
-- Purpose: Prevent duplicate subject codes within the same semester.
-- ==============================================================================

-- STEP 1: VERIFY DUPLICATES BEFORE APPLYING
-- Run this query first. If this returns any rows, DO NOT apply the ALTER TABLE command below.
-- Duplicate subjects must be inspected and resolved manually (e.g. by renaming the duplicate
-- code or merging records) rather than being deleted automatically.

SELECT semester_id, subject_code, COUNT(*) AS duplicate_count, GROUP_CONCAT(id) AS subject_ids
FROM subjects
GROUP BY semester_id, subject_code
HAVING duplicate_count > 1;

-- ==============================================================================
-- STEP 2: MANUAL CLEANUP GUIDANCE (IF DUPLICATES EXIST)
-- If duplicate records exist above:
-- 1. Check whether any results are linked to each duplicate subject in the results table:
--    SELECT r.id, r.usn, r.subject_code, r.exam_session_id 
--    FROM results r 
--    WHERE r.subject_code IN ('DUPLICATE_CODE');
-- 2. If one entry is an accidental duplicate with no results, it can be deleted manually.
-- 3. If both entries have results or belong to different elective tracks, update one of the
--    subject codes to be unique (e.g., 'MCA101-A' or 'MCA101E').
-- ==============================================================================

-- STEP 3: SAFE APPLICATION OF UNIQUE CONSTRAINT
-- Only run when duplicate count query in Step 1 returns 0 rows.
-- Check if index uk_subject_semester already exists:

SET @constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subjects'
    AND index_name = 'uk_subject_semester'
);

-- Apply index if not already present:
SET @sql_stmt = IF(@constraint_exists = 0,
  'ALTER TABLE subjects ADD CONSTRAINT uk_subject_semester UNIQUE (semester_id, subject_code);',
  'SELECT "Index uk_subject_semester already exists on subjects table." AS notice;'
);

PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
