'use strict';

const resultCalculationService = require('./resultCalculationService');
const { getPool, isDbDisabled } = require('../config/db');

const names = [
  'Ravi Kumar', 'Anil Sharma', 'Prakash Singh', 'Vikram Patel', 'Sanjay Roy',
  'Amit Mishra', 'Rohit Jain', 'Sameer Singh', 'Gaurav Agarwal', 'Deepak Choudhary',
  'Priya Singh', 'Neha Sharma', 'Pooja Patel', 'Sneha Roy', 'Kriti Mishra',
  'Payal Jain', 'Ritu Singh', 'Kavita Patel', 'Monika Sharma', 'Anita Sharma'
];

/** Create the generator API. Dependency overrides keep isolated tests off the configured database. */
function createService(overrides = {}) {
  const poolProvider = overrides.getPool || getPool;
  const dbDisabled = overrides.isDbDisabled || isDbDisabled;
  const env = overrides.env || process.env;
  const calculation = overrides.calculationService || resultCalculationService;
  const random = overrides.random || Math.random;

  function isGenerationEnabled() {
    const configuredDb = String(env.DB_NAME || '').trim();
    const allowedDb = String(env.TEST_DATA_DATABASE_NAME || '').trim();
    const isExplicitNonProduction = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
    const hasTestDatabaseMarker = /(^|[_-])(test|testing|sandbox|dev|development)([_-]|$)/i.test(allowedDb);
    return isExplicitNonProduction &&
      String(env.ALLOW_TEST_DATA_GENERATION || '').toLowerCase() === 'true' &&
      !dbDisabled() &&
      configuredDb.length > 0 && allowedDb.length > 0 && configuredDb === allowedDb && hasTestDatabaseMarker;
  }

  function createError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  function parseId(value, name) {
    if (!/^[1-9]\d*$/.test(String(value ?? ''))) {
      throw createError(`${name} must be a positive integer.`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw createError(`${name} is invalid.`);
    return parsed;
  }

  function validateRequest(input = {}) {
    const quantityText = String(input.quantity ?? '');
    if (!/^\d+$/.test(quantityText)) throw createError('Quantity must be a whole number from 1 to 50.');
    const quantity = Number(quantityText);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw createError('Quantity must be a whole number from 1 to 50.');
    }
    if (!Array.isArray(input.subjectIds) || input.subjectIds.length === 0 || input.subjectIds.length > 30) {
      throw createError('Select between 1 and 30 subjects.');
    }
    const subjectIds = input.subjectIds.map((id, index) => parseId(id, `Subject ${index + 1}`));
    if (new Set(subjectIds).size !== subjectIds.length) throw createError('Duplicate subjects are not allowed.');
    const includeGeneratedAcademicItems = input.includeGeneratedAcademicItems === true || input.includeGeneratedAcademicItems === 'true';
    if (input.includeGeneratedAcademicItems !== undefined && typeof input.includeGeneratedAcademicItems !== 'boolean' && input.includeGeneratedAcademicItems !== 'true' && input.includeGeneratedAcademicItems !== 'false') {
      throw createError('Generated academic items must be enabled or disabled.');
    }
    const generatedSubjectCount = includeGeneratedAcademicItems ? Number(input.generatedSubjectCount ?? 1) : 0;
    if (includeGeneratedAcademicItems && (!Number.isInteger(generatedSubjectCount) || generatedSubjectCount < 1 || generatedSubjectCount > 5)) {
      throw createError('Generated subject count must be a whole number from 1 to 5.');
    }
    return {
      quantity,
      batchId: parseId(input.batchId, 'Batch'),
      semesterId: parseId(input.semesterId, 'Semester'),
      examSessionId: parseId(input.examSessionId, 'Exam session'),
      subjectIds,
      includeGeneratedAcademicItems,
      generatedSubjectCount
    };
  }

  /** Create a unique synthetic USN that stays within the students.usn column limit. */
  function generateUSN(sequence, existingUsns = new Set()) {
    let candidate = `TST${String(sequence).padStart(12, '0')}`;
    let suffix = sequence;
    while (existingUsns.has(candidate)) {
      suffix += 1;
      candidate = `TST${String(suffix).padStart(12, '0')}`;
    }
    return candidate;
  }

  async function generateStudentData(batchId, sequence, existingUsns, existingEmails) {
    const usn = generateUSN(sequence, existingUsns);
    const name = names[Math.floor(random() * names.length)];
    let email = `test.${usn.toLowerCase()}@example.test`;
    let suffix = 1;
    while (existingEmails.has(email)) {
      email = `test.${usn.toLowerCase()}.${suffix++}@example.test`;
    }
    existingUsns.add(usn);
    existingEmails.add(email);
    return { usn, name, email, batch_id: batchId };
  }

  function generateUniqueSubjectCode(semesterId, existingCodes) {
    let sequence = 1;
    let subjectCode = `TST${semesterId}S${String(sequence).padStart(4, '0')}`;
    while (existingCodes.has(subjectCode)) {
      sequence += 1;
      subjectCode = `TST${semesterId}S${String(sequence).padStart(4, '0')}`;
    }
    existingCodes.add(subjectCode);
    return subjectCode;
  }

  function generateSubjectData(semesterId, existingCodes) {
    const subjectCode = generateUniqueSubjectCode(semesterId, existingCodes);
    const sequence = existingCodes.size;
    return {
      semester_id: semesterId,
      subject_code: subjectCode,
      subject_name: `Synthetic Test Subject ${sequence}`,
      max_internal_marks: 40,
      max_external_marks: 60,
      total_maximum_marks: 100,
      credits: [3, 4, 5][Math.floor(random() * 3)],
      status: 'Active'
    };
  }

  function generateExamSessionData(semesterId, existingNames) {
    const year = new Date().getFullYear();
    const baseName = `Synthetic Test Session ${semesterId} ${year}`;
    let sessionName = baseName;
    let suffix = 1;
    while (existingNames.has(sessionName)) sessionName = `${baseName} ${suffix++}`;
    existingNames.add(sessionName);
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - 1);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 3);
    return {
      semester_id: semesterId,
      session_name: sessionName,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      status: 'Active'
    };
  }

  async function generateResultData(usn, subject, examSessionId, existingResults) {
    const resultKey = `${usn}|${subject.subject_code}|${examSessionId}`;
    if (existingResults.has(resultKey)) return null;
    existingResults.add(resultKey);

    const maxMarks = Number(subject.total_maximum_marks);
    const maxCie = Number(subject.max_internal_marks);
    const maxSee = Number(subject.max_external_marks);
    if (!Number.isFinite(maxMarks) || maxMarks <= 0 || !Number.isFinite(maxCie) || maxCie < 25 || !Number.isFinite(maxSee) || maxSee < 20 || Math.abs(maxCie + maxSee - maxMarks) > 0.01) {
      throw createError(`Subject ${subject.subject_code} has an invalid maximum mark value.`, 422);
    }
    const cie = Math.round(random() * maxCie * 100) / 100;
    const see = Math.round(random() * maxSee * 100) / 100;
    const marks = calculation.calculateTotalMarks(cie, see);
    if (marks === null || marks > maxMarks) throw createError(`Generated marks for ${subject.subject_code} exceed its maximum.`, 422);
    const percentage = (marks / maxMarks) * 100;
    const grade = calculation.calculateGrade(percentage);
    const status = calculation.determineSubjectResult(cie, see, marks).status;
    return {
      usn,
      subject_code: subject.subject_code,
      subject_name: subject.subject_name,
      marks_obtained: marks,
      max_marks: maxMarks,
      grade,
      status,
      exam_session_id: examSessionId
    };
  }

  /** List real batch, semester, exam-session and subject choices for the generator form. */
  async function getOptions() {
    if (dbDisabled()) throw createError('Database integration is disabled.', 503);
    const pool = poolProvider();
    if (!pool) throw createError('Database pool unavailable.', 503);
    const [batches] = await pool.execute('SELECT id, batch_name FROM batches ORDER BY start_year DESC, id DESC');
    const [semesters] = await pool.execute('SELECT id, batch_id, semester_number, semester_name FROM semesters ORDER BY batch_id, semester_number');
    const [sessions] = await pool.execute('SELECT id, semester_id, session_name FROM exam_sessions ORDER BY semester_id, id DESC');
    const [subjects] = await pool.execute('SELECT id, semester_id, subject_code, subject_name FROM subjects WHERE status = ? ORDER BY semester_id, subject_code', ['Active']);
    return { batches, semesters, examSessions: sessions, subjects };
  }

  /** Validate selected academic relationships and atomically insert synthetic records. */
  async function generateTestData(input) {
    // Fail closed unless both an explicit enable flag and an exact safe database name are configured.
    if (!isGenerationEnabled()) {
      throw createError('Test data generation is disabled. Configure an explicit non-production test database to enable it.', 403);
    }
    if (dbDisabled()) throw createError('Database integration is disabled.', 503);
    const request = validateRequest(input);
    const pool = poolProvider();
    if (!pool) throw createError('Database pool unavailable.', 503);

    // Keep validation and writes on one connection; model insert helpers use the pool directly and cannot join this transaction.
    const connection = await pool.getConnection();
    let transactionStarted = false;
    let lockAcquired = false;
    try {
      const [lockRows] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', ['sras_test_data_generator']);
      if (Number(lockRows[0]?.acquired) !== 1) throw createError('Another generation request is in progress. Try again shortly.', 409);
      lockAcquired = true;
      await connection.beginTransaction();
      transactionStarted = true;

      const [batches] = await connection.execute('SELECT id, batch_name FROM batches WHERE id = ? FOR UPDATE', [request.batchId]);
      if (!batches.length) throw createError('Batch not found.', 404);

      const [semesters] = await connection.execute('SELECT id, batch_id, semester_number, semester_name FROM semesters WHERE id = ? FOR UPDATE', [request.semesterId]);
      if (!semesters.length) throw createError('Semester not found.', 404);
      if (Number(semesters[0].batch_id) !== request.batchId) throw createError('Selected semester does not belong to the selected batch.', 422);

      const [sessions] = await connection.execute('SELECT id, semester_id, session_name FROM exam_sessions WHERE id = ? FOR UPDATE', [request.examSessionId]);
      if (!sessions.length) throw createError('Exam session not found.', 404);
      if (Number(sessions[0].semester_id) !== request.semesterId) throw createError('Selected exam session does not belong to the selected semester.', 422);

      const placeholders = request.subjectIds.map(() => '?').join(', ');
      const [subjects] = await connection.execute(
        `SELECT id, semester_id, subject_code, subject_name, max_internal_marks, max_external_marks, total_maximum_marks FROM subjects WHERE semester_id = ? AND id IN (${placeholders}) AND status = 'Active' ORDER BY id FOR UPDATE`,
        [request.semesterId, ...request.subjectIds]
      );
      if (subjects.length !== request.subjectIds.length) {
        throw createError('Every selected subject must be active and belong to the selected semester.', 422);
      }

      let generatedSubjects = [];
      let generatedExamSession = null;
      if (request.includeGeneratedAcademicItems) {
        const [codeRows] = await connection.execute('SELECT subject_code FROM subjects WHERE semester_id = ? FOR UPDATE', [request.semesterId]);
        const existingCodes = new Set(codeRows.map((row) => String(row.subject_code).toUpperCase()));
        for (let index = 0; index < request.generatedSubjectCount; index += 1) {
          const subject = generateSubjectData(request.semesterId, existingCodes);
          const [inserted] = await connection.execute(
            `INSERT INTO subjects (semester_id, subject_code, subject_name, max_internal_marks, max_external_marks, total_maximum_marks, credits, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [subject.semester_id, subject.subject_code, subject.subject_name, subject.max_internal_marks, subject.max_external_marks, subject.total_maximum_marks, subject.credits, subject.status]
          );
          generatedSubjects.push({ id: inserted.insertId, ...subject });
        }

        const [sessionRows] = await connection.execute('SELECT session_name FROM exam_sessions WHERE semester_id = ? FOR UPDATE', [request.semesterId]);
        const existingSessionNames = new Set(sessionRows.map((row) => String(row.session_name)));
        const newSession = generateExamSessionData(request.semesterId, existingSessionNames);
        const [insertedSession] = await connection.execute(
          'INSERT INTO exam_sessions (semester_id, session_name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)',
          [newSession.semester_id, newSession.session_name, newSession.start_date, newSession.end_date, newSession.status]
        );
        generatedExamSession = { id: insertedSession.insertId, ...newSession };
      }

      // Generated IDs use an isolated prefix; lock existing synthetic identifiers to prevent reuse.
      const [existingStudents] = await connection.execute(
        "SELECT usn, email FROM students WHERE usn LIKE 'TST%' FOR UPDATE"
      );
      const existingUsns = new Set(existingStudents.map((row) => String(row.usn)));
      const existingEmails = new Set(existingStudents.map((row) => String(row.email).toLowerCase()));
      const generatedStudents = [];
      for (let index = 0; index < request.quantity; index += 1) {
        const student = await generateStudentData(request.batchId, index + 1, existingUsns, existingEmails);
        const [inserted] = await connection.execute(
          'INSERT INTO students (usn, name, email, batch_id) VALUES (?, ?, ?, ?)',
          [student.usn, student.name, student.email, request.batchId]
        );
        generatedStudents.push({ id: inserted.insertId, ...student });
      }

      const existingResults = new Set();
      let generatedResultCount = 0;
      const resultGroups = [{ examSessionId: request.examSessionId, subjects }];
      if (generatedExamSession) resultGroups.push({ examSessionId: generatedExamSession.id, subjects: generatedSubjects });
      for (const student of generatedStudents) {
        for (const group of resultGroups) {
          for (const subject of group.subjects) {
          const [duplicates] = await connection.execute(
            'SELECT id FROM results WHERE usn = ? AND subject_code = ? AND exam_session_id = ? LIMIT 1 FOR UPDATE',
            [student.usn, subject.subject_code, group.examSessionId]
          );
          if (duplicates.length) continue;
          const result = await generateResultData(student.usn, subject, group.examSessionId, existingResults);
          if (!result) continue;
          await connection.execute(
            `INSERT INTO results (usn, subject_code, subject_name, marks_obtained, max_marks, grade, status, exam_session_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [result.usn, result.subject_code, result.subject_name, result.marks_obtained, result.max_marks, result.grade, result.status, result.exam_session_id]
          );
          generatedResultCount += 1;
          }
        }
      }

      await connection.commit();
      transactionStarted = false;
      return {
        batch: batches[0],
        semester: semesters[0],
        examSession: sessions[0],
        generatedExamSession,
        students: generatedStudents,
        generatedSubjects,
        subjectCount: subjects.length + generatedSubjects.length,
        resultCount: generatedResultCount
      };
    } catch (error) {
      if (transactionStarted) {
        try { await connection.rollback(); } catch (rollbackError) { error.rollbackError = rollbackError; }
      }
      throw error;
    } finally {
      if (lockAcquired) {
        try { await connection.execute('SELECT RELEASE_LOCK(?)', ['sras_test_data_generator']); } catch (_) { /* release connection also releases lock */ }
      }
      connection.release();
    }
  }

  return { generateTestData, getOptions, isGenerationEnabled, generateUSN, generateStudentData, generateSubjectData, generateExamSessionData, generateResultData };
}

const service = createService();
module.exports = {
  ...service,
  createService
};
