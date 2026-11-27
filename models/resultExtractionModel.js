'use strict';

const batchModel = require('./batchModel');
const semesterModel = require('./semesterModel');
const examSessionModel = require('./examSessionModel');
const { getPool, isDbDisabled } = require('../config/db');

async function listBatches() { return batchModel.getAllBatches(); }
async function listSemesters(batchId) { return semesterModel.getSemestersByBatch(batchId); }
async function listExamSessions(semesterId) { return examSessionModel.getAllExamSessions('', semesterId); }
async function listExamSessionsByBatch(batchId) {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];
  const [rows] = await pool.execute(`SELECT es.id, es.semester_id AS semesterId, es.session_name AS sessionName,
      sem.semester_number AS semesterNumber, sem.semester_name AS semesterName
    FROM exam_sessions es JOIN semesters sem ON sem.id = es.semester_id
    WHERE sem.batch_id = ? ORDER BY sem.semester_number, es.created_at DESC, es.id DESC`, [batchId]);
  return rows;
}
async function getSemester(semesterId) { return semesterModel.getSemesterById(semesterId); }

async function getSelectionContext(batchId, semesterId, examSessionId, executor = null) {
  if (isDbDisabled()) return null;
  const pool = executor || getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(`SELECT b.id AS batchId, b.batch_name AS batchName,
      sem.id AS semesterId, sem.semester_number AS semesterNumber, sem.semester_name AS semesterName,
      es.id AS examSessionId, es.session_name AS examSessionName
    FROM batches b
    JOIN semesters sem ON sem.batch_id = b.id
    JOIN exam_sessions es ON es.semester_id = sem.id
    WHERE b.id = ? AND sem.id = ? AND es.id = ?
    LIMIT 1${executor ? ' FOR UPDATE' : ''}`, [batchId, semesterId, examSessionId]);
  return rows[0] || null;
}

async function getValidationReferenceData(batchId, semesterId, usns = [], executor = null) {
  if (isDbDisabled()) return null;
  const pool = executor || getPool();
  if (!pool) return null;
  const normalizedUsns = [...new Set(usns.map((usn) => String(usn || '').trim().toUpperCase()).filter(Boolean))];
  let studentSql = 'SELECT id, usn, name, batch_id AS batchId FROM students';
  const studentParams = [];
  if (normalizedUsns.length) {
    studentSql += ` WHERE UPPER(usn) IN (${normalizedUsns.map(() => '?').join(',')})`;
    studentParams.push(...normalizedUsns);
  }
  if (executor) studentSql += ' FOR UPDATE';
  const [studentRows] = await pool.execute(studentSql, studentParams);
  const [subjectRows] = await pool.execute(
    `SELECT id, subject_code AS subjectCode, subject_name AS subjectName,
            max_internal_marks AS maxInternalMarks, max_external_marks AS maxExternalMarks,
            total_maximum_marks AS totalMaximumMarks
     FROM subjects WHERE semester_id = ?${executor ? ' FOR UPDATE' : ''}`,
    [semesterId]
  );
  let existingResults = [];
  if (normalizedUsns.length) {
    const [resultRows] = await pool.execute(
      `SELECT UPPER(r.usn) AS usn, UPPER(r.subject_code) AS subjectCode,
              r.exam_session_id AS examSessionId, es.session_name AS sessionName
       FROM results r
       JOIN exam_sessions es ON es.id = r.exam_session_id
       WHERE es.semester_id = ? AND UPPER(r.usn) IN (${normalizedUsns.map(() => '?').join(',')})${executor ? ' FOR UPDATE' : ''}`,
      [semesterId, ...normalizedUsns]
    );
    existingResults = resultRows;
  }
  return { students: studentRows, subjects: subjectRows, existingResults };
}

module.exports = { listBatches, listSemesters, listExamSessions, listExamSessionsByBatch, getSemester, getSelectionContext, getValidationReferenceData };
