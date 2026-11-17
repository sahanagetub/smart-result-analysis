'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createResultService, validateResultInput } = require('../services/resultService');

const validInput = (overrides = {}) => ({
  usn: '1RV24MCA01',
  subject_code: 'MCA101',
  subject_name: 'Algorithms',
  marks_obtained: 50,
  max_marks: 100,
  exam_session_id: 4,
  ...overrides
});

function fixture({ duplicate = false, failInsert = false } = {}) {
  const state = { records: [], began: 0, committed: 0, rolledBack: 0, released: false, lockReleased: false, connections: 0 };
  const model = {
    async resultExists(usn, code, sessionId) {
      return duplicate || state.records.some((row) => row.usn === usn && row.subject_code === code && row.exam_session_id === sessionId);
    },
    async createResult(record) {
      if (failInsert) throw new Error('mock database insert failure');
      state.records.push(record);
      return 91;
    },
    async createResultsTable() {},
    async getAllResults() { return []; },
    async getResultsByExamSession() { return []; },
    async getResultStats() { return { total: 0, pass: 0, fail: 0, passPercent: 0 }; },
    async deleteResult() { return true; }
  };
  const connection = {
    async execute(sql) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) { state.lockReleased = true; return [[{ released: 1 }]]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async beginTransaction() { state.began += 1; },
    async commit() { state.committed += 1; },
    async rollback() { state.rolledBack += 1; state.records = []; },
    release() { state.released = true; }
  };
  const service = (data) => createResultService(data, {
    resultModel: model,
    getPool: () => ({ async getConnection() { state.connections += 1; return connection; } }),
    isDbDisabled: () => false
  });
  return { state, service };
}

test('result input validates required fields, safe session id and mark bounds', () => {
  assert.equal(validateResultInput(validInput()).marks_obtained, 50);
  assert.throws(() => validateResultInput(validInput({ marks_obtained: -0.01 })), { status: 400, message: 'Marks obtained cannot be negative.' });
  assert.throws(() => validateResultInput(validInput({ marks_obtained: 101 })), { status: 400, message: 'Marks obtained cannot exceed maximum marks.' });
  assert.throws(() => validateResultInput(validInput({ max_marks: 0 })), { status: 400, message: 'Maximum marks must be greater than zero.' });
  assert.throws(() => validateResultInput(validInput({ marks_obtained: 'not-a-number' })), { status: 400, message: 'Marks obtained must be a valid number.' });
  assert.throws(() => validateResultInput(validInput({ exam_session_id: '1.2' })), { status: 400 });
});

test('result creation uses shared grade calculation and commits an insert-only result', async () => {
  const { state, service } = fixture();
  const id = await service(validInput({ marks_obtained: 80 }));
  assert.equal(id, 91);
  assert.equal(state.records[0].grade, 'A+');
  assert.equal(state.records[0].status, 'Pass');
  assert.deepEqual({ began: state.began, committed: state.committed, rolledBack: state.rolledBack }, { began: 1, committed: 1, rolledBack: 0 });
  assert.equal(state.lockReleased, true);
  assert.equal(state.released, true);
});

test('result status uses the stored combined-mark rule when CIE/SEE are unavailable', async () => {
  const { state, service } = fixture();
  await service(validInput({ marks_obtained: 49.99 }));
  assert.equal(state.records[0].grade, 'F');
  assert.equal(state.records[0].status, 'Fail');
  await service(validInput({ usn: '1RV24MCA02', marks_obtained: 50 }));
  assert.equal(state.records[1].grade, 'C');
  assert.equal(state.records[1].status, 'Pass');
});

test('duplicate result key returns conflict without inserting or overwriting', async () => {
  const { state, service } = fixture({ duplicate: true });
  await assert.rejects(service(validInput()), { status: 409, message: 'A result already exists for this student, subject and exam session.' });
  assert.equal(state.records.length, 0);
  assert.equal(state.rolledBack, 1);
});

test('database failure rolls back and releases the transaction connection', async () => {
  const { state, service } = fixture({ failInsert: true });
  await assert.rejects(service(validInput()), /mock database insert failure/);
  assert.equal(state.committed, 0);
  assert.equal(state.rolledBack, 1);
  assert.equal(state.released, true);
});
