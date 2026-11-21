'use strict';

const { getPool, isDbDisabled } = require('../config/db');

function poolOrNull() {
  if (isDbDisabled()) return null;
  const pool = getPool();
  if (!pool) return null;
  return pool;
}

async function getReportRows(filters = {}) {
  const pool = poolOrNull();
  if (!pool) return [];
  const where = ['es.id = ?'];
  const params = [filters.examSessionId];
  if (filters.batchId) { where.push('b.id = ?'); params.push(filters.batchId); }
  if (filters.semesterId) { where.push('sem.id = ?'); params.push(filters.semesterId); }
  if (filters.search) {
    where.push('(st.usn LIKE ? OR st.name LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  const [rows] = await pool.execute(`
    SELECT st.usn, st.name AS studentName, b.id AS batchId, b.batch_name AS batchName,
      sem.id AS semesterId, sem.semester_number AS semesterNumber, sem.semester_name AS semesterName,
      es.id AS examSessionId, es.session_name AS examSessionName,
      sub.subject_code AS subjectCode, COALESCE(sub.subject_name, r.subject_name) AS subjectName,
      r.marks_obtained AS marksObtained, r.max_marks AS maxMarks, r.status,
      r.id AS resultId
    FROM exam_sessions es
    JOIN semesters sem ON sem.id = es.semester_id
    JOIN batches b ON b.id = sem.batch_id
    JOIN students st ON st.batch_id = b.id
    LEFT JOIN subjects sub ON sub.semester_id = sem.id
    LEFT JOIN results r ON r.usn = st.usn AND r.exam_session_id = es.id
      AND (sub.subject_code IS NULL OR r.subject_code = sub.subject_code)
    WHERE ${where.join(' AND ')}
    ORDER BY st.usn, sub.subject_code, r.subject_code`, params);
  return rows;
}

async function getFilterOptions() {
  const pool = poolOrNull();
  if (!pool) return { batches: [], semesters: [], examSessions: [], subjects: [] };
  const [batches] = await pool.execute('SELECT id, batch_name AS batchName FROM batches ORDER BY batch_name');
  const [semesters] = await pool.execute(`SELECT sem.id, sem.batch_id AS batchId, sem.semester_number AS semesterNumber,
    sem.semester_name AS semesterName FROM semesters sem ORDER BY sem.semester_number, sem.semester_name`);
  const [examSessions] = await pool.execute(`SELECT es.id, es.semester_id AS semesterId, es.session_name AS sessionName,
    sem.batch_id AS batchId, sem.semester_number AS semesterNumber, sem.semester_name AS semesterName
    FROM exam_sessions es JOIN semesters sem ON sem.id = es.semester_id ORDER BY es.id DESC`);
  const [subjects] = await pool.execute(`SELECT id, semester_id AS semesterId, subject_code AS subjectCode,
    subject_name AS subjectName FROM subjects ORDER BY subject_code`);
  return { batches, semesters, examSessions, subjects };
}

async function getStudentRows(usn, filters = {}) {
  const pool = poolOrNull();
  if (!pool) return [];
  const where = ['st.usn = ?'];
  const params = [usn];
  if (filters.batchId) { where.push('b.id = ?'); params.push(filters.batchId); }
  if (filters.semesterId) { where.push('sem.id = ?'); params.push(filters.semesterId); }
  if (filters.examSessionId) { where.push('es.id = ?'); params.push(filters.examSessionId); }
  const [rows] = await pool.execute(`
    SELECT st.usn, st.name AS studentName, st.email, b.id AS batchId, b.batch_name AS batchName,
      b.start_year AS academicStartYear, b.end_year AS academicEndYear,
      sem.id AS semesterId, sem.semester_number AS semesterNumber, sem.semester_name AS semesterName,
      es.id AS examSessionId, es.session_name AS examSessionName,
      sub.subject_code AS subjectCode, sub.subject_name AS subjectName, sub.credits,
      r.id AS resultId, r.marks_obtained AS marksObtained, r.max_marks AS maxMarks,
      r.grade, r.status
    FROM students st
    JOIN batches b ON b.id = st.batch_id
    LEFT JOIN semesters sem ON sem.batch_id = b.id
    LEFT JOIN exam_sessions es ON es.semester_id = sem.id
    LEFT JOIN subjects sub ON sub.semester_id = sem.id
    LEFT JOIN results r ON r.usn = st.usn AND r.exam_session_id = es.id
      AND (sub.subject_code IS NULL OR r.subject_code = sub.subject_code)
    WHERE ${where.join(' AND ')}
    ORDER BY sem.semester_number, es.id, sub.subject_code`, params);
  return rows;
}

module.exports = { getReportRows, getFilterOptions, getStudentRows };
