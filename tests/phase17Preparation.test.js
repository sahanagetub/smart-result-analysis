'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCleanupService, isDevelopmentDatabase, classifyResultRow } = require('../database/scripts/cleanupDevelopmentResults');

test('normal app startup no longer invokes demo data seeding', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.doesNotMatch(appSource, /require\(['"]\.\/services\/seedService['"]\)/);
  assert.doesNotMatch(appSource, /seedDemoData\s*\(/);
});

test('demo seeder remains available through explicit, development-only runner', () => {
  const runner = fs.readFileSync(path.join(__dirname, '..', 'database', 'seeders', 'runDemoSeed.js'), 'utf8');
  assert.match(runner, /seedDemoData\(\)/);
  assert.match(runner, /NODE_ENV=development or test/);
  assert.match(runner, /DB_NAME/);
});

function syntheticResultRow(resultId, overrides = {}) {
  return {
    resultId, usn: 'TST000000000001', studentName: 'SYNTHETIC TEST STUDENT', studentEmail: 'test.one@example.test',
    batchName: 'Test Batch', subjectCode: 'MCA101', subjectName: 'Algorithms', marksObtained: 81, maxMarks: 100,
    grade: 'A+', status: 'Pass', examSessionId: 5, examSessionName: 'Regular', semesterName: 'Semester 1',
    ...overrides
  };
}

test('cleanup dry run previews every result with marks, context, and synthetic classification', async () => {
  const calls = [];
  const pool = {
    execute: async (sql) => {
      calls.push(sql);
      if (/COUNT\(\*\)/.test(sql)) return [[{ resultCount: 1, studentCount: 1, batchCount: 1, semesterCount: 1, subjectCount: 1, examSessionCount: 1 }]];
      if (/information_schema\.KEY_COLUMN_USAGE/.test(sql)) return [[{ tableName: 'results', columnName: 'exam_session_id', referencedTableName: 'exam_sessions', referencedColumnName: 'id' }]];
      return [[syntheticResultRow(12)]];
    }
  };
  const service = createCleanupService({ pool, env: { NODE_ENV: 'development', DB_HOST: 'localhost', DB_NAME: 'smart_result_dev' } });
  const result = await service.run();
  assert.equal(result.applied, false);
  assert.equal(result.candidateCount, 1);
  assert.equal(result.records[0].resultId, 12);
  assert.equal(result.records[0].marksObtained, 81);
  assert.equal(result.records[0].subjectCode, 'MCA101');
  assert.equal(result.records[0].deletionEligible, true);
  assert.equal(result.relationships[0].referencedTableName, 'exam_sessions');
  assert.equal(calls.length, 3);
  assert.match(calls.find((sql) => /FROM results r/.test(sql)), /r\.marks_obtained/);
  assert.ok(calls.every((sql) => !/DELETE\s+FROM/i.test(sql)));
});

test('cleanup apply requires a development database and explicit delete opt-in', async () => {
  let reads = 0;
  const service = createCleanupService({
    pool: { execute: async () => { reads += 1; return [[]]; } },
    env: { NODE_ENV: 'production', DB_HOST: 'localhost', DB_NAME: 'smart_result_prod' }
  });
  await assert.rejects(service.run({ apply: true }), /requires NODE_ENV=development/);
  assert.equal(reads, 0);

  const missingOptIn = createCleanupService({
    pool: { execute: async () => { reads += 1; return [[]]; } },
    env: { NODE_ENV: 'development', DB_HOST: 'localhost', DB_NAME: 'smart_result_dev' }
  });
  await assert.rejects(missingOptIn.run({ apply: true }), /ALLOW_DEVELOPMENT_RESULT_CLEANUP/);
  assert.equal(reads, 0);
});

test('cleanup requires explicit reviewed IDs and only deletes marked result rows', async () => {
  const executed = [];
  const candidateRows = [syntheticResultRow(12), syntheticResultRow(13)];
  const counts = { resultCount: 2, studentCount: 5, batchCount: 1, semesterCount: 1, subjectCount: 2, examSessionCount: 1 };
  let transactionCountReads = 0;
  let deletionApplied = false;
  const connection = {
    beginTransaction: async () => executed.push('BEGIN'),
    execute: async (sql, params) => {
      executed.push({ sql, params });
      if (/SELECT id FROM results ORDER BY id/.test(sql)) {
        return [[...(deletionApplied ? [] : [12, 13]).map((id) => ({ id }))]];
      }
      if (/COUNT\(\*\)/.test(sql)) {
        transactionCountReads += 1;
        return [[transactionCountReads === 1 ? counts : { ...counts, resultCount: 0 }]];
      }
      if (/FROM results r/.test(sql)) return [candidateRows];
      if (/^DELETE FROM results/i.test(sql)) { deletionApplied = true; return [{ affectedRows: 2 }]; }
      return [{ affectedRows: 2 }];
    },
    commit: async () => executed.push('COMMIT'),
    rollback: async () => executed.push('ROLLBACK'),
    release: () => executed.push('RELEASE')
  };
  const pool = {
    getConnection: async () => connection,
    execute: async (sql) => {
      executed.push({ sql, params: [] });
      if (/SELECT id FROM results ORDER BY id/.test(sql)) return [[]];
      return [[{ ...counts, resultCount: 0 }]];
    }
  };
  const service = createCleanupService({
    pool,
    env: {
      NODE_ENV: 'development',
      DB_HOST: 'localhost',
      DB_NAME: 'smart_result_test',
      ALLOW_DEVELOPMENT_RESULT_CLEANUP: 'DELETE_SYNTHETIC_RESULTS'
    }
  });
  await assert.rejects(service.run({ apply: true }), /explicit --approve-ids/);
  const result = await service.run({ apply: true, approvedIds: [12, 13] });
  const deleteCall = executed.find((entry) => typeof entry === 'object' && /^DELETE/i.test(entry.sql));
  assert.equal(result.applied, true);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.deletedCount, 2);
  assert.equal(result.referencesUnchanged, true);
  assert.match(deleteCall.sql, /^DELETE FROM results WHERE id IN \(\?, \?\)$/i);
  assert.deepEqual(deleteCall.params, [12, 13]);
  assert.equal(result.transactionCounts.resultCount, 0);
  assert.ok(executed.includes('COMMIT'));
  assert.ok(executed.includes('RELEASE'));
});

test('cleanup rolls back when transactional verification detects unexpected master changes', async () => {
  const executed = [];
  let countReads = 0;
  const connection = {
    beginTransaction: async () => executed.push('BEGIN'),
    execute: async (sql) => {
      if (/FROM results r/.test(sql)) return [[syntheticResultRow(29)]];
      if (/SELECT id FROM results ORDER BY id/.test(sql)) return [[{ id: 29 }]];
      if (/COUNT\(\*\)/.test(sql)) {
        countReads += 1;
        return [[countReads === 1
          ? { resultCount: 1, studentCount: 1, batchCount: 1, semesterCount: 1, subjectCount: 1, examSessionCount: 1 }
          : { resultCount: 0, studentCount: 0, batchCount: 1, semesterCount: 1, subjectCount: 1, examSessionCount: 1 }]];
      }
      if (/^DELETE FROM results/i.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    commit: async () => executed.push('COMMIT'),
    rollback: async () => executed.push('ROLLBACK'),
    release: () => executed.push('RELEASE')
  };
  const service = createCleanupService({
    pool: { getConnection: async () => connection },
    env: { NODE_ENV: 'development', DB_HOST: 'localhost', DB_NAME: 'smart_result_dev', ALLOW_DEVELOPMENT_RESULT_CLEANUP: 'DELETE_SYNTHETIC_RESULTS' }
  });
  await assert.rejects(service.run({ apply: true, approvedIds: [29] }), /master-table count changed.*rolled back/);
  assert.ok(executed.includes('ROLLBACK'));
  assert.ok(!executed.includes('COMMIT'));
});

test('cleanup rolls back if the result deletion fails', async () => {
  const executed = [];
  const connection = {
    beginTransaction: async () => executed.push('BEGIN'),
    execute: async (sql) => {
      if (/SELECT id FROM results ORDER BY id/.test(sql)) return [[{ id: 19 }]];
      if (/COUNT\(\*\)/.test(sql)) return [[{ resultCount: 1, studentCount: 1, batchCount: 1, semesterCount: 1, subjectCount: 1, examSessionCount: 1 }]];
      if (/FROM results r/.test(sql)) return [[syntheticResultRow(19)]];
      throw new Error('delete failed');
    },
    commit: async () => executed.push('COMMIT'),
    rollback: async () => executed.push('ROLLBACK'),
    release: () => executed.push('RELEASE')
  };
  const service = createCleanupService({
    pool: { getConnection: async () => connection },
    env: {
      NODE_ENV: 'development',
      DB_HOST: 'localhost',
      DB_NAME: 'smart_result_dev',
      ALLOW_DEVELOPMENT_RESULT_CLEANUP: 'DELETE_SYNTHETIC_RESULTS'
    }
  });
  await assert.rejects(service.run({ apply: true, approvedIds: [19] }), /delete failed/);
  assert.ok(executed.includes('ROLLBACK'));
  assert.ok(!executed.includes('COMMIT'));
});

test('cleanup rejects explicit approval for unmarked or ambiguous result rows', async () => {
  const connection = {
    beginTransaction: async () => {},
    execute: async (sql) => {
      if (/SELECT id FROM results ORDER BY id/.test(sql)) return [[{ id: 44 }]];
      if (/FROM results r/.test(sql)) return [[syntheticResultRow(44, { usn: '1MV25MC044', studentEmail: 'student@university.edu' })]];
      return [[{ resultCount: 1, studentCount: 1, batchCount: 1, semesterCount: 1, subjectCount: 1, examSessionCount: 1 }]];
    },
    commit: async () => assert.fail('ambiguous record must not commit'),
    rollback: async () => {},
    release: () => {}
  };
  const service = createCleanupService({
    pool: { getConnection: async () => connection },
    env: { NODE_ENV: 'development', DB_HOST: 'localhost', DB_NAME: 'smart_result_dev', ALLOW_DEVELOPMENT_RESULT_CLEANUP: 'DELETE_SYNTHETIC_RESULTS' }
  });
  await assert.rejects(service.run({ apply: true, approvedIds: [44] }), /ambiguous\/non-synthetic/);
});

test('legacy demo rows require an exact source manifest match before becoming deletion candidates', () => {
  const known = {
    usn: '1RV25MC001', studentName: 'Ravi Kumar', studentEmail: 'ravi.kumar@example.com', batchName: '2025-2027',
    subjectCode: 'MCA101', subjectName: 'Advanced Data Structures', marksObtained: 86, maxMarks: 100,
    grade: 'A+', status: 'Pass', examSessionName: 'Jan-Feb 2025 Regular Examination', semesterName: 'Semester 1'
  };
  assert.equal(classifyResultRow(known).classification, 'verified-legacy-demo-seed');
  assert.equal(classifyResultRow(known).deletionEligible, true);
  assert.equal(classifyResultRow({ ...known, marksObtained: 85 }).deletionEligible, false);
});

test('cleanup database allowlist rejects production or unmarked database names', () => {
  assert.equal(isDevelopmentDatabase({ NODE_ENV: 'development', DB_HOST: 'localhost', DB_NAME: 'smart_result_sandbox' }), true);
  assert.equal(isDevelopmentDatabase({ NODE_ENV: 'production', DB_HOST: 'localhost', DB_NAME: 'smart_result_dev' }), false);
  assert.equal(isDevelopmentDatabase({ NODE_ENV: 'development', DB_HOST: 'localhost', DB_NAME: 'smart_result_analysis' }), false);
  assert.equal(isDevelopmentDatabase({ NODE_ENV: 'development', DB_HOST: 'localhost', DB_NAME: 'smart_result_analysis', ALLOW_UNMARKED_LOCAL_DEVELOPMENT_DATABASE: 'smart_result_analysis' }), true);
});

test('existing Phase 13 PDF upload route and Phase 14 extraction route remain wired', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'index.js'), 'utf8');
  assert.match(routes, /result-uploads/);
  assert.match(routes, /result-extractions/);
  const uploadService = fs.readFileSync(path.join(__dirname, '..', 'services', 'resultUploadService.js'), 'utf8');
  const extractionService = fs.readFileSync(path.join(__dirname, '..', 'services', 'resultPdfExtractionService.js'), 'utf8');
  assert.match(uploadService, /previewUploadedFile/);
  assert.match(extractionService, /extractPdf/);
});
