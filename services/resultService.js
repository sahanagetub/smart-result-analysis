'use strict';

const crypto = require('crypto');
const resultModel = require('../models/resultModel');
const resultCalculationService = require('./resultCalculationService');
const { getPool, isDbDisabled } = require('../config/db');

async function initResultsTable() {
  await resultModel.createResultsTable();
}

function createServiceError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseFiniteNumber(value, field) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || typeof value === 'boolean') {
    throw createServiceError(`${field} must be a valid number.`, 400);
  }
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw createServiceError(`${field} must be a valid number.`, 400);
  return number;
}

function validateResultInput(data = {}) {
  const usn = typeof data.usn === 'string' ? data.usn.trim() : '';
  const subjectCode = typeof data.subject_code === 'string' ? data.subject_code.trim() : '';
  const subjectName = typeof data.subject_name === 'string' ? data.subject_name.trim() : '';
  const examSessionId = Number(data.exam_session_id);
  if (!usn || !subjectCode || !subjectName || !Number.isSafeInteger(examSessionId) || examSessionId < 1) {
    throw createServiceError('USN, subject code, subject name and a valid exam session are required.', 400);
  }

  const marks = parseFiniteNumber(data.marks_obtained, 'Marks obtained');
  const maxMarks = parseFiniteNumber(data.max_marks, 'Maximum marks');
  if (marks < 0) throw createServiceError('Marks obtained cannot be negative.', 400);
  if (maxMarks <= 0) throw createServiceError('Maximum marks must be greater than zero.', 400);
  if (marks > maxMarks) throw createServiceError('Marks obtained cannot exceed maximum marks.', 400);

  return { usn, subject_code: subjectCode, subject_name: subjectName, marks_obtained: marks, max_marks: maxMarks, exam_session_id: examSessionId };
}

/** Validate, calculate, and insert one result without updating any existing result. */
async function createResultService(data, dependencies = {}) {
  const model = dependencies.resultModel || resultModel;
  const calculation = dependencies.calculationService || resultCalculationService;
  const disabled = dependencies.isDbDisabled || isDbDisabled;
  const poolProvider = dependencies.getPool || getPool;
  const input = validateResultInput(data);

  // The stored results schema has combined marks only. When CIE/SEE are absent,
  // preserve the established historical rule: grade by percentage, pass at 50%.
  const percentage = (input.marks_obtained / input.max_marks) * 100;
  const grade = calculation.calculateGrade(percentage);
  if (grade === null) throw createServiceError('Marks produce an invalid percentage.', 400);
  const status = percentage >= 50 ? 'Pass' : 'Fail';
  const record = { ...input, grade, status };

  if (disabled()) throw createServiceError('Database integration is disabled.', 503);
  const pool = poolProvider();
  if (!pool) throw createServiceError('Database pool unavailable.', 503);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let lockAcquired = false;
  const lockKey = `sras:result:${crypto.createHash('sha256').update(`${input.usn.trim().toUpperCase()}|${input.subject_code.trim().toUpperCase()}|${input.exam_session_id}`).digest('hex').slice(0, 48)}`;

  try {
    const [lockRows] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockKey]);
    if (Number(lockRows[0]?.acquired) !== 1) throw createServiceError('This result is currently being created. Try again shortly.', 409);
    lockAcquired = true;
    await connection.beginTransaction();
    transactionStarted = true;

    if (await model.resultExists(input.usn, input.subject_code, input.exam_session_id, connection)) {
      throw createServiceError('A result already exists for this student, subject and exam session.', 409);
    }
    const id = await model.createResult(record, connection);
    await connection.commit();
    transactionStarted = false;
    return id;
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback(); } catch (rollbackError) { error.rollbackError = rollbackError; }
    }
    throw error;
  } finally {
    if (lockAcquired) {
      try { await connection.execute('SELECT RELEASE_LOCK(?)', [lockKey]); } catch (_) { /* releasing the connection also releases the lock */ }
    }
    connection.release();
  }
}

/** Insert a confirmed upload atomically; duplicate keys fail the whole batch. */
async function createResultsBatchService(records, dependencies = {}) {
  if (!Array.isArray(records) || records.length === 0) throw createServiceError('At least one result is required.', 400);
  if (records.length > 10000) throw createServiceError('An upload may contain at most 10,000 result rows.', 413);
  const model = dependencies.resultModel || resultModel;
  const disabled = dependencies.isDbDisabled || isDbDisabled;
  const poolProvider = dependencies.getPool || getPool;
  if (disabled()) throw createServiceError('Database integration is disabled.', 503);
  const pool = poolProvider();
  if (!pool) throw createServiceError('Database pool unavailable.', 503);
  const normalized = records.map((record) => {
    const input = validateResultInput(record);
    const maxInternal = Number(record.max_internal_marks);
    const maxExternal = Number(record.max_external_marks);
    if (!(maxInternal > 0) || !(maxExternal > 0) || Math.abs(maxInternal + maxExternal - input.max_marks) > 0.01) {
      throw createServiceError('Configured internal and external marks do not match the result maximum.', 400);
    }
    const outcome = resultCalculationService.determineSubjectResult(Number(record.internal_marks), Number(record.external_marks), input.marks_obtained);
    const grade = resultCalculationService.calculateGrade((input.marks_obtained / input.max_marks) * 100);
    if (grade === null || outcome.status !== record.status) throw createServiceError('The extracted result does not match Phase 9 calculation rules.', 400);
    return { ...input, grade, status: outcome.status, exam_session_name: String(record.exam_session_name || '') };
  });
  const keys = normalized.map((record) => `${record.usn.trim().toUpperCase()}|${record.subject_code.trim().toUpperCase()}|${record.exam_session_id}`);
  if (new Set(keys).size !== keys.length) throw createServiceError('The upload contains duplicate student-subject-session rows.', 409);
  const lockKeys = [...new Set(keys)].map((key) => `sras:result:${crypto.createHash('sha256').update(key).digest('hex').slice(0, 48)}`).sort();
  const connection = await pool.getConnection();
  const acquiredLocks = [];
  let transactionStarted = false;
  try {
    for (const lockKey of lockKeys) {
      const [rows] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockKey]);
      if (Number(rows[0]?.acquired) !== 1) throw createServiceError('A result in this upload is being saved by another request. Try again shortly.', 409);
      acquiredLocks.push(lockKey);
    }
    await connection.beginTransaction();
    transactionStarted = true;
    if (typeof dependencies.beforeInsert === 'function') {
      await dependencies.beforeInsert(connection, normalized);
    }
    for (const record of normalized) {
      if (await model.resultExists(record.usn, record.subject_code, record.exam_session_id, connection)) {
        throw createServiceError(`An existing result for ${record.usn}, ${record.subject_code}, and this exam session was found. Nothing was saved; review it and choose another session or cancel.`, 409);
      }
    }
    const ids = [];
    for (const record of normalized) ids.push(await model.createResult(record, connection));
    await connection.commit();
    transactionStarted = false;
    return { savedCount: ids.length, resultIds: ids };
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback(); } catch (rollbackError) { error.rollbackError = rollbackError; }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      let conflict = null;
      for (const record of normalized) {
        if (await model.resultExists(record.usn, record.subject_code, record.exam_session_id, connection)) { conflict = record; break; }
      }
      const detail = conflict
        ? `Duplicate original result for ${conflict.usn}, subject ${conflict.subject_code}, exam session "${conflict.exam_session_name || conflict.exam_session_id}". Nothing was overwritten.`
        : 'An existing result conflicts with this upload. Nothing was overwritten.';
      throw createServiceError(detail, 409);
    }
    throw error;
  } finally {
    for (const lockKey of acquiredLocks.reverse()) {
      try { await connection.execute('SELECT RELEASE_LOCK(?)', [lockKey]); } catch (_) { /* disconnect releases named locks */ }
    }
    connection.release();
  }
}

async function listResultsService(search = '') {
  return resultModel.getAllResults(search);
}

async function getResultsByExamSessionService(examSessionId) {
  return resultModel.getResultsByExamSession(examSessionId);
}

async function getResultStatsService() {
  return resultModel.getResultStats();
}

async function deleteResultService(id) {
  const deleted = await resultModel.deleteResult(id);
  if (!deleted) throw createServiceError('Result not found.', 404);
  return { message: 'Result deleted successfully.' };
}

module.exports = {
  initResultsTable,
  createResultService,
  createResultsBatchService,
  validateResultInput,
  listResultsService,
  getResultsByExamSessionService,
  getResultStatsService,
  deleteResultService
};
