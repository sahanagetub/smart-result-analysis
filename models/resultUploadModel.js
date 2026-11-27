'use strict';

const { getPool, isDbDisabled } = require('../config/db');

function chunks(values, size = 400) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function getReferenceData(records, selection = {}, executor = null) {
  if (isDbDisabled()) return null;
  const pool = executor || getPool();
  if (!pool) return null;
  const usns = [...new Set(records.map((record) => String(record.usn || '').trim().toUpperCase()).filter(Boolean))];
  const students = new Map();
  for (const group of chunks(usns)) {
    const placeholders = group.map(() => '?').join(',');
    const [rows] = await pool.execute(`SELECT id, usn, name, batch_id AS batchId FROM students WHERE UPPER(usn) IN (${placeholders})${executor ? ' FOR UPDATE' : ''}`, group);
    rows.forEach((row) => students.set(String(row.usn).toUpperCase(), { id: Number(row.id), usn: row.usn, name: row.name, batchId: Number(row.batchId) }));
  }
  const batchIds = [...new Set([...students.values()].map((student) => student.batchId))];
  const semesters = new Map();
  for (const group of chunks(batchIds)) {
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(',');
    const [rows] = await pool.execute(`SELECT id, batch_id AS batchId, semester_number AS semesterNumber, semester_name AS semesterName FROM semesters WHERE batch_id IN (${placeholders})${executor ? ' FOR UPDATE' : ''}`, group);
    rows.forEach((row) => semesters.set(`${Number(row.batchId)}:${Number(row.semesterNumber)}`, { id: Number(row.id), batchId: Number(row.batchId), semesterNumber: Number(row.semesterNumber), semesterName: row.semesterName }));
  }
  const semesterIds = selection.semesterId
    ? [Number(selection.semesterId)]
    : [...new Set([...semesters.values()].map((semester) => semester.id))];
  const subjects = new Map();
  for (const group of chunks(semesterIds)) {
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(',');
    const [rows] = await pool.execute(`SELECT id, semester_id AS semesterId, subject_code AS subjectCode, subject_name AS subjectName,
      max_internal_marks AS maxInternalMarks, max_external_marks AS maxExternalMarks,
      total_maximum_marks AS totalMaximumMarks
      FROM subjects WHERE semester_id IN (${placeholders})${executor ? ' FOR UPDATE' : ''}`, group);
    rows.forEach((row) => subjects.set(`${Number(row.semesterId)}:${String(row.subjectCode).toUpperCase()}`, {
      id: Number(row.id), semesterId: Number(row.semesterId), subjectCode: String(row.subjectCode).toUpperCase(), subjectName: row.subjectName,
      maxInternalMarks: Number(row.maxInternalMarks), maxExternalMarks: Number(row.maxExternalMarks),
      totalMaximumMarks: Number(row.totalMaximumMarks)
    }));
  }
  let selectedSemester = null;
  if (selection.batchId || selection.semesterId) {
    const [rows] = await pool.execute(`SELECT id, batch_id AS batchId, semester_number AS semesterNumber, semester_name AS semesterName FROM semesters WHERE id = ? LIMIT 1${executor ? ' FOR UPDATE' : ''}`, [selection.semesterId]);
    if (rows[0]) selectedSemester = { id: Number(rows[0].id), batchId: Number(rows[0].batchId), semesterNumber: Number(rows[0].semesterNumber), semesterName: rows[0].semesterName };
  }
  const existingResults = new Map();
  const knownSemesterIds = [...new Set([...semesters.values()].map((semester) => Number(semester.id)).concat(selectedSemester ? [selectedSemester.id] : []))];
  for (const usnGroup of chunks(usns)) {
    for (const semesterGroup of chunks(knownSemesterIds)) {
      if (!usnGroup.length || !semesterGroup.length) continue;
      const usnPlaceholders = usnGroup.map(() => '?').join(',');
      const semesterPlaceholders = semesterGroup.map(() => '?').join(',');
      const [rows] = await pool.execute(`SELECT UPPER(r.usn) AS usn, UPPER(r.subject_code) AS subjectCode,
          es.semester_id AS semesterId, r.exam_session_id AS examSessionId, es.session_name AS sessionName
        FROM results r JOIN exam_sessions es ON es.id = r.exam_session_id
        WHERE UPPER(r.usn) IN (${usnPlaceholders}) AND es.semester_id IN (${semesterPlaceholders})${executor ? ' FOR UPDATE' : ''}`,
      [...usnGroup, ...semesterGroup]);
      rows.forEach((row) => existingResults.set(
        `${String(row.usn).toUpperCase()}:${Number(row.semesterId)}:${String(row.subjectCode).toUpperCase()}`,
        { ...row, semesterId: Number(row.semesterId), examSessionId: Number(row.examSessionId) }
      ));
    }
  }
  return { students, semesters, subjects, selectedSemester, existingResults };
}

async function getExamSessions(semesterIds = []) {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];
  const ids = [...new Set(semesterIds.map(Number).filter(Number.isSafeInteger))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(`SELECT es.id, es.semester_id AS semesterId, es.session_name AS sessionName, es.status,
    sem.semester_number AS semesterNumber, sem.batch_id AS batchId
    FROM exam_sessions es JOIN semesters sem ON sem.id = es.semester_id
    WHERE es.semester_id IN (${placeholders}) ORDER BY es.id DESC`, ids);
  return rows.map((row) => ({ ...row, id: Number(row.id), semesterId: Number(row.semesterId), semesterNumber: Number(row.semesterNumber), batchId: Number(row.batchId) }));
}

async function findExamSession(sessionId, executor = null) {
  if (isDbDisabled()) return null;
  const queryExecutor = executor || getPool();
  if (!queryExecutor) return null;
  const [rows] = await queryExecutor.execute(`SELECT es.id, es.semester_id AS semesterId, es.session_name AS sessionName,
    sem.batch_id AS batchId FROM exam_sessions es JOIN semesters sem ON sem.id = es.semester_id WHERE es.id = ? LIMIT 1`, [sessionId]);
  return rows[0] ? { ...rows[0], id: Number(rows[0].id), semesterId: Number(rows[0].semesterId), batchId: Number(rows[0].batchId) } : null;
}

async function findExamSessionForUpdate(sessionId, executor) {
  if (isDbDisabled() || !executor) return null;
  const [rows] = await executor.execute(`SELECT es.id, es.semester_id AS semesterId, sem.semester_number AS semesterNumber,
      sem.batch_id AS batchId, es.session_name AS sessionName
    FROM exam_sessions es JOIN semesters sem ON sem.id = es.semester_id
    WHERE es.id = ? LIMIT 1 FOR UPDATE`, [sessionId]);
  return rows[0] ? { ...rows[0], id: Number(rows[0].id), semesterId: Number(rows[0].semesterId), semesterNumber: Number(rows[0].semesterNumber), batchId: Number(rows[0].batchId) } : null;
}

module.exports = { getReferenceData, getExamSessions, findExamSession, findExamSessionForUpdate };
