'use strict';

const { getPool, isDbDisabled } = require('../../config/db');
const fs = require('node:fs');
const path = require('node:path');

// High-confidence generator markers are deletable only when the exact result
// ids are explicitly approved. Unmarked legacy rows remain review-only.
const RESULT_REVIEW_QUERY = `
  SELECT r.id AS resultId, r.usn, st.name AS studentName, st.email AS studentEmail,
         b.batch_name AS batchName, r.subject_code AS subjectCode,
         COALESCE(sub.subject_name, r.subject_name) AS subjectName,
         r.marks_obtained AS marksObtained, r.max_marks AS maxMarks,
         r.grade, r.status, r.exam_session_id AS examSessionId,
         es.session_name AS examSessionName, sem.semester_name AS semesterName,
         es.id AS joinedExamSessionId
  FROM results r
  LEFT JOIN students st ON st.usn = r.usn
  LEFT JOIN batches b ON b.id = st.batch_id
  LEFT JOIN exam_sessions es ON es.id = r.exam_session_id
  LEFT JOIN semesters sem ON sem.id = es.semester_id
  LEFT JOIN subjects sub ON sub.subject_code = r.subject_code
    AND sub.semester_id = es.semester_id
  ORDER BY r.usn, r.exam_session_id, r.subject_code, r.id
`;

const DATABASE_COUNTS_QUERY = `
  SELECT (SELECT COUNT(*) FROM results) AS resultCount,
         (SELECT COUNT(*) FROM students) AS studentCount,
         (SELECT COUNT(*) FROM batches) AS batchCount,
         (SELECT COUNT(*) FROM semesters) AS semesterCount,
         (SELECT COUNT(*) FROM subjects) AS subjectCount,
         (SELECT COUNT(*) FROM exam_sessions) AS examSessionCount
`;
const RESULT_IDS_QUERY = 'SELECT id FROM results ORDER BY id';
const DATABASE_RELATIONSHIPS_QUERY = `
  SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName,
         CONSTRAINT_NAME AS constraintName, REFERENCED_TABLE_NAME AS referencedTableName,
         REFERENCED_COLUMN_NAME AS referencedColumnName
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME IN ('results', 'students', 'semesters', 'subjects', 'exam_sessions')
    AND REFERENCED_TABLE_NAME IS NOT NULL
  ORDER BY TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME
`;

// Exact manifest of the deterministic demo rows in services/seedService.js.
// A row is considered verified legacy demo data only when every identity,
// academic context, subject and marks field matches this source manifest.
const DEMO_SEED_STUDENTS = [
  ['1RV25MC001', 'Ravi Kumar', 'ravi.kumar@example.com', [86, 88, 84, 89, 87, 85]],
  ['1RV25MC002', 'Priya Singh', 'priya.singh@example.com', [92, 95, 88, 91, 94, 90]],
  ['1RV25MC003', 'Amit Patel', 'amit.patel@example.com', [80, 82, 79, 85, 81, 78]],
  ['1RV25MC004', 'Sneha Roy', 'sneha.roy@example.com', [70, 68, 73, 71, 69, 72]],
  ['1RV25MC005', 'Rohit Jain', 'rohit.jain@example.com', [74, 76, 72, 75, 78, 71]],
  ['1RV25MC006', 'Kavita Verma', 'kavita.verma@example.com', [65, 62, 67, 64, 66, 63]],
  ['1RV25MC007', 'Deepak Choudhary', 'deepak.c@example.com', [60, 64, 61, 63, 62, 59]],
  ['1RV25MC008', 'Anil Sharma', 'anil.sharma@example.com', [58, 56, 59, 57, 55, 60]],
  ['1RV25MC009', 'Vikram Malhotra', 'vikram.m@example.com', [56, 55, 57, 58, 54, 56]],
  ['1RV25MC010', 'Pooja Sharma', 'pooja.s@example.com', [52, 54, 51, 50, 53, 52]],
  ['1RV25MC011', 'Neha Gupta', 'neha.gupta@example.com', [51, 53, 50, 52, 51, 50]],
  ['1RV25MC012', 'Sameer Khan', 'sameer.khan@example.com', [52, 50, 48, 54, 51, 53]],
  ['1RV25MC013', 'Anita Desai', 'anita.desai@example.com', [48, 52, 50, 51, 49, 53]],
  ['1RV25MC014', 'Gaurav Agarwal', 'gaurav.a@example.com', [42, 45, 39, 44, 40, 46]],
  ['1RV25MC015', 'Kriti Sen', 'kriti.sen@example.com', [45, 48, 42, 46, 44, 43]]
].map(([usn, name, email, marks]) => [usn, { name, email, marks }]);
const DEMO_SUBJECTS = [
  ['MCA101', 'Advanced Data Structures'], ['MCA102', 'Advanced Database Systems'],
  ['MCA103', 'Web Technologies'], ['MCA104', 'Software Engineering & Design Patterns'],
  ['MCA105', 'Cloud Computing & DevOps'], ['MCA106', 'Machine Learning Fundamentals']
];

function demoSeedMatch(row) {
  const student = new Map(DEMO_SEED_STUDENTS).get(String(row.usn || '').toUpperCase());
  const subjectIndex = DEMO_SUBJECTS.findIndex(([code]) => code === String(row.subjectCode || '').toUpperCase());
  if (!student || subjectIndex < 0) return false;
  const expectedMarks = student.marks[subjectIndex];
  const expectedStatus = expectedMarks >= 50 ? 'Pass' : 'Fail';
  const expectedGrade = expectedMarks >= 90 ? 'O' : expectedMarks >= 80 ? 'A+' : expectedMarks >= 70 ? 'A' : expectedMarks >= 60 ? 'B+' : expectedMarks >= 55 ? 'B' : expectedMarks >= 50 ? 'C' : 'F';
  return row.studentName === student.name && String(row.studentEmail || '').toLowerCase() === student.email &&
    row.batchName === '2025-2027' && row.semesterName === 'Semester 1' &&
    row.examSessionName === 'Jan-Feb 2025 Regular Examination' &&
    row.subjectName === DEMO_SUBJECTS[subjectIndex][1] && Number(row.marksObtained) === expectedMarks &&
    Number(row.maxMarks) === 100 && row.status === expectedStatus && row.grade === expectedGrade;
}

function isLocalDevelopmentTarget(env) {
  return env.NODE_ENV === 'development' &&
    ['localhost', '127.0.0.1', '::1'].includes(String(env.DB_HOST || '').toLowerCase());
}

function isDevelopmentDatabase(env) {
  if (!isLocalDevelopmentTarget(env)) return false;
  const markedName = /(^|[_-])(dev|development|test|testing|sandbox)([_-]|$)/i.test(String(env.DB_NAME || ''));
  const explicitlyAllowedLocalName = String(env.ALLOW_UNMARKED_LOCAL_DEVELOPMENT_DATABASE || '') === String(env.DB_NAME || '');
  return markedName || explicitlyAllowedLocalName;
}

function classifyResultRow(row) {
  const usn = String(row.usn || '').toUpperCase();
  const email = String(row.studentEmail || '').toLowerCase();
  const sessionName = String(row.examSessionName || '');
  const subjectCode = String(row.subjectCode || '').toUpperCase();
  const subjectName = String(row.subjectName || '');
  const reasons = [];
  if (usn.startsWith('TST')) reasons.push('synthetic TST USN');
  if (/^test\..*@example\.test$/.test(email)) reasons.push('synthetic test email');
  if (sessionName.startsWith('Synthetic Test Session ')) reasons.push('synthetic test exam session');
  if (/^TST\d+S\d+$/i.test(subjectCode)) reasons.push('synthetic test subject code');
  if (subjectName.startsWith('Synthetic Test Subject ')) reasons.push('synthetic test subject name');
  if (reasons.length) return { classification: 'synthetic-marked', deletionEligible: true, reasons };

  if (demoSeedMatch(row)) {
    return { classification: 'verified-legacy-demo-seed', deletionEligible: true, reasons: ['all identity, session, subject, marks, grade and status fields exactly match services/seedService.js demo fixture'] };
  }
  if (/^1RV25MC0(?:0[1-9]|1[0-5])$/.test(usn) && email.endsWith('@example.com')) {
    return { classification: 'legacy-demo-student', deletionEligible: false, reasons: ['matches demo seeder identity but row differs from exact seed manifest'] };
  }
  if (/^USN202400(?:0[1-9]|10)$/.test(usn)) {
    return { classification: 'legacy-phase8-possible', deletionEligible: false, reasons: ['matches legacy Phase 8 test USN pattern; review manually'] };
  }
  return { classification: 'unmarked', deletionEligible: false, reasons: ['no reliable synthetic provenance marker'] };
}

function printableRecord(row) {
  return {
    resultId: Number(row.resultId), usn: row.usn, studentName: row.studentName,
    batchName: row.batchName, subjectCode: row.subjectCode, subjectName: row.subjectName,
    marksObtained: Number(row.marksObtained), maxMarks: Number(row.maxMarks),
    grade: row.grade, status: row.status, examSessionId: Number(row.examSessionId),
    examSessionName: row.examSessionName, semesterName: row.semesterName,
    ...classifyResultRow(row)
  };
}

function parseApprovedIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map(Number))];
  if (value === undefined || value === null || value === '') return [];
  const tokens = String(value).split(',').map((part) => part.trim());
  if (tokens.some((token) => !/^[1-9]\d*$/.test(token))) throw new Error('Approved result IDs must be a comma-separated list of positive integers.');
  return [...new Set(tokens.map(Number))];
}

function createCleanupService({ pool, env = process.env }) {
  async function resultIds(executor = pool, lock = false) {
    const [rows] = await executor.execute(`${RESULT_IDS_QUERY}${lock ? ' FOR UPDATE' : ''}`);
    return rows.map((row) => Number(row.id));
  }

  async function reviewRecords(executor = pool, lock = false) {
    const [rows] = await executor.execute(`${RESULT_REVIEW_QUERY}${lock ? ' FOR UPDATE' : ''}`);
    return rows.map(printableRecord);
  }

  async function databaseCounts(executor = pool) {
    const [rows] = await executor.execute(DATABASE_COUNTS_QUERY);
    const row = rows[0] || {};
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value) || 0]));
  }

  async function databaseRelationships(executor = pool) {
    const [rows] = await executor.execute(DATABASE_RELATIONSHIPS_QUERY);
    return rows;
  }

  async function run({ apply = false, approvedIds = [], requiredClassification = null } = {}) {
    if (!isLocalDevelopmentTarget(env)) {
      throw new Error('Cleanup preview requires NODE_ENV=development and a local DB_HOST.');
    }
    if (apply && !isDevelopmentDatabase(env)) {
      throw new Error('Cleanup apply requires a marked development DB_NAME or an exact ALLOW_UNMARKED_LOCAL_DEVELOPMENT_DATABASE match.');
    }
    if (apply && env.ALLOW_DEVELOPMENT_RESULT_CLEANUP !== 'DELETE_SYNTHETIC_RESULTS') {
      throw new Error('Apply mode requires ALLOW_DEVELOPMENT_RESULT_CLEANUP=DELETE_SYNTHETIC_RESULTS.');
    }
    if (!pool) throw new Error('Database pool unavailable.');

    if (!apply) {
      const [records, counts, relationships] = await Promise.all([reviewRecords(), databaseCounts(), databaseRelationships()]);
      const candidates = records.filter((record) => record.deletionEligible);
      return { applied: false, counts, relationships, recordCount: records.length, candidateCount: candidates.length, candidates, records };
    }

    const ids = parseApprovedIds(approvedIds);
    if (!ids.length) throw new Error('Apply mode requires explicit --approve-ids matching records from a reviewed dry run.');

    const connection = await pool.getConnection();
    let transactionStarted = false;
    try {
      await connection.beginTransaction();
      transactionStarted = true;
      const beforeResultIds = await resultIds(connection, true);
      const existingIds = new Set(beforeResultIds);
      const missingIds = ids.filter((id) => !existingIds.has(id));
      if (missingIds.length) throw new Error(`Approved result IDs do not exist: ${missingIds.join(', ')}.`);
      const currentRecords = await reviewRecords(connection, true);
      const eligible = new Map(currentRecords.filter((record) => record.deletionEligible).map((record) => [record.resultId, record]));
      const unapprovedCandidates = ids.filter((id) => !eligible.has(id));
      if (unapprovedCandidates.length) {
        throw new Error(`Approved IDs are missing or are ambiguous/non-synthetic: ${unapprovedCandidates.join(', ')}.`);
      }
      if (requiredClassification && ids.some((id) => eligible.get(id)?.classification !== requiredClassification)) {
        throw new Error(`Approved IDs no longer match required synthetic classification: ${requiredClassification}.`);
      }
      const eligibleApprovedIds = new Set(currentRecords.filter((record) => record.deletionEligible).map((record) => record.resultId));
      if (ids.some((id) => !eligibleApprovedIds.has(id))) throw new Error('Every approved result ID must still match the synthetic manifest.');
      const beforeCounts = await databaseCounts(connection);
      const placeholders = ids.map(() => '?').join(', ');
      const [deleted] = await connection.execute(`DELETE FROM results WHERE id IN (${placeholders})`, ids);
      if (Number(deleted.affectedRows) !== ids.length) throw new Error('The number of deleted result rows did not match the approved ID count.');

      // Verify the expected result count and untouched master tables before
      // commit so an integrity mismatch still rolls back atomically.
      const transactionCounts = await databaseCounts(connection);
      if (transactionCounts.resultCount !== beforeCounts.resultCount - ids.length) {
        throw new Error('The result count did not match the approved deletion count; cleanup was rolled back.');
      }
      const referencesUnchanged = ['studentCount', 'batchCount', 'semesterCount', 'subjectCount', 'examSessionCount']
        .every((key) => beforeCounts[key] === transactionCounts[key]);
      if (!referencesUnchanged) throw new Error('A master-table count changed during cleanup; cleanup was rolled back.');
      const expectedRemainingIds = beforeResultIds.filter((id) => !ids.includes(id));
      const transactionRemainingIds = await resultIds(connection, true);
      if (transactionRemainingIds.length !== expectedRemainingIds.length ||
          transactionRemainingIds.some((id, index) => id !== expectedRemainingIds[index])) {
        throw new Error('Remaining result IDs differ from the approved deletion plan; cleanup was rolled back.');
      }

      await connection.commit();
      transactionStarted = false;
      let afterCounts = null;
      let postCommitVerificationError = null;
      try {
        afterCounts = await databaseCounts(pool);
      } catch (verificationError) {
        // The committed transaction cannot be rolled back at this point. Keep
        // the successful operation visible and report the verification issue.
        postCommitVerificationError = verificationError.message;
      }
      let afterResultIds = null;
      let postCommitResultVerificationError = null;
      try {
        afterResultIds = await resultIds(pool);
        if (afterResultIds.length !== expectedRemainingIds.length ||
            afterResultIds.some((id, index) => id !== expectedRemainingIds[index])) {
          postCommitResultVerificationError = 'Post-commit result IDs differ from the transaction verification.';
        }
      } catch (verificationError) {
        postCommitResultVerificationError = verificationError.message;
      }
      return {
        applied: true, candidateCount: ids.length, deletedCount: deleted.affectedRows,
        deletedIds: ids, remainingResultIds: transactionRemainingIds,
        beforeResultIds, beforeCounts, transactionCounts, afterCounts,
        afterResultIds, referencesUnchanged, postCommitVerificationError,
        postCommitResultVerificationError
      };
    } catch (error) {
      if (transactionStarted) {
        try { await connection.rollback(); } catch (rollbackError) { error.rollbackError = rollbackError; }
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  return { reviewRecords, databaseCounts, run };
}

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const approval = argv.find((arg) => arg.startsWith('--approve-ids='));
  return { apply, approvedIds: approval ? approval.slice('--approve-ids='.length) : [] };
}

async function main() {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  if (process.env.NODE_ENV !== 'development' || process.env.DB_NAME !== 'smart_result_analysis') {
    throw new Error('Approved cleanup is restricted to NODE_ENV=development and DB_NAME=smart_result_analysis.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const args = parseArgs(process.argv.slice(2));
  const approvedIds = Array.from({ length: 90 }, (_, index) => index + 1);
  const suppliedIds = parseApprovedIds(args.approvedIds);
  if (args.apply && (suppliedIds.length !== 90 || suppliedIds.some((id, index) => id !== approvedIds[index]))) {
    throw new Error('This approved operation may delete only the reviewed result IDs 1 through 90.');
  }
  const [databaseRows] = await pool.execute('SELECT DATABASE() AS databaseName');
  if (databaseRows[0]?.databaseName !== 'smart_result_analysis') {
    throw new Error(`Connected database mismatch: expected smart_result_analysis, got ${databaseRows[0]?.databaseName || 'unknown'}.`);
  }
  const service = createCleanupService({ pool });
  if (args.apply) {
    const preview = await service.run({ apply: false });
    const previewIds = preview.candidates.map((record) => record.resultId).sort((a, b) => a - b);
    if (preview.recordCount !== 90 || preview.candidateCount !== 90 ||
        previewIds.some((id, index) => id !== approvedIds[index]) ||
        preview.candidates.some((record) => record.classification !== 'verified-legacy-demo-seed')) {
      throw new Error('Fresh cleanup preview did not exactly match approved synthetic result IDs 1 through 90. No rows were changed.');
    }
  }
  let logPath = null;
  if (args.apply) {
    const logDirectory = path.join(__dirname, '..', 'logs');
    fs.mkdirSync(logDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    logPath = path.join(logDirectory, `phase17-result-cleanup-${timestamp}.json`);
    fs.writeFileSync(logPath, `${JSON.stringify({
      status: 'pending', environment: process.env.NODE_ENV,
      database: process.env.DB_NAME, approvedResultIds: approvedIds
    }, null, 2)}\n`, { flag: 'wx' });
  }
  let result;
  try {
    result = await service.run({
      ...args, approvedIds: args.apply ? approvedIds : args.approvedIds,
      ...(args.apply ? { requiredClassification: 'verified-legacy-demo-seed' } : {})
    });
  } catch (error) {
    if (logPath) fs.writeFileSync(logPath, `${JSON.stringify({
      status: 'rolled_back_or_not_applied', environment: process.env.NODE_ENV,
      database: process.env.DB_NAME, approvedResultIds: approvedIds,
      error: error.message, rollbackError: error.rollbackError?.message || null
    }, null, 2)}\n`);
    throw error;
  }
  if (result.applied) {
    const audit = {
      status: 'committed',
      targetDatabase: process.env.DB_NAME,
      approvedResultIds: approvedIds,
      deletedCount: result.deletedCount,
      deletedIds: result.deletedIds,
      remainingResultCount: result.remainingResultIds.length,
      beforeCounts: result.beforeCounts,
      transactionCounts: result.transactionCounts,
      afterCounts: result.afterCounts,
      postCommitResultVerificationError: result.postCommitResultVerificationError,
      referencesUnchanged: result.referencesUnchanged,
      postCommitVerificationError: result.postCommitVerificationError
    };
    if (logPath) fs.writeFileSync(logPath, `${JSON.stringify({ ...audit, logPath }, null, 2)}\n`);
    console.log(JSON.stringify({ ...audit, logPath }, null, 2));
    return;
  }
  console.log(`Read-only review: ${result.recordCount} result rows; ${result.candidateCount} high-confidence synthetic candidates.`);
  console.log('Database counts:', JSON.stringify(result.counts));
  console.log('Foreign-key relationships:', JSON.stringify(result.relationships));
  for (const record of result.records) console.log(JSON.stringify(record));
  console.log('No rows were changed. Unmarked and non-matching legacy rows are not eligible for deletion.');
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Development result cleanup stopped safely: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      const pool = getPool();
      if (pool) await pool.end();
    });
}

module.exports = {
  createCleanupService, isDevelopmentDatabase, isLocalDevelopmentTarget,
  classifyResultRow, printableRecord, parseApprovedIds, parseArgs,
  RESULT_REVIEW_QUERY, DATABASE_COUNTS_QUERY, DATABASE_RELATIONSHIPS_QUERY, demoSeedMatch
};
