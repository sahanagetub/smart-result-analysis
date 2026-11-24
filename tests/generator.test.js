'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../services/generatorService');

function fixture(overrides = {}) {
  const state = {
    batches: [{ id: 7, batch_name: 'Test Batch' }],
    semesters: [{ id: 9, batch_id: 7, semester_number: 1, semester_name: 'Semester 1' }],
    sessions: [{ id: 11, semester_id: 9, session_name: 'Test Session' }],
    subjects: [
      { id: 21, semester_id: 9, subject_code: 'TST101', subject_name: 'Test Subject', max_internal_marks: 40, max_external_marks: 60, total_maximum_marks: 100 },
      { id: 22, semester_id: 9, subject_code: 'TST102', subject_name: 'Second Subject', max_internal_marks: 40, max_external_marks: 60, total_maximum_marks: 100 }
    ],
    students: [],
    results: [],
    nextSubjectId: 23,
    nextSessionId: 12,
    nextStudentId: 1,
    nextResultId: 1,
    transactions: { began: 0, committed: 0, rolledBack: 0 },
    failOnResultInsert: false
  };
  Object.assign(state, overrides.state || {});
  const snapshot = () => JSON.parse(JSON.stringify({ students: state.students, results: state.results, subjects: state.subjects, sessions: state.sessions, nextStudentId: state.nextStudentId, nextResultId: state.nextResultId, nextSubjectId: state.nextSubjectId, nextSessionId: state.nextSessionId }));
  let before;
  const connection = {
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
      if (normalized.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]];
      if (normalized.startsWith('SELECT id, batch_name FROM batches WHERE id =')) return [[...state.batches.filter((row) => row.id === params[0])]];
      if (normalized.startsWith('SELECT id, batch_id, semester_number, semester_name FROM semesters WHERE id =')) return [[...state.semesters.filter((row) => row.id === params[0])]];
      if (normalized.startsWith('SELECT id, semester_id, session_name FROM exam_sessions WHERE id =')) return [[...state.sessions.filter((row) => row.id === params[0])]];
      if (normalized.startsWith('SELECT id, semester_id, subject_code, subject_name, max_internal_marks, max_external_marks, total_maximum_marks FROM subjects')) {
        const [semesterId, ...ids] = params;
        return [[...state.subjects.filter((row) => row.semester_id === semesterId && ids.includes(row.id))]];
      }
      if (normalized.startsWith('SELECT subject_code FROM subjects WHERE semester_id =')) {
        return [[...state.subjects.filter((row) => row.semester_id === params[0]).map(({ subject_code }) => ({ subject_code }))]];
      }
      if (normalized.startsWith('SELECT session_name FROM exam_sessions WHERE semester_id =')) {
        return [[...state.sessions.filter((row) => row.semester_id === params[0]).map(({ session_name }) => ({ session_name }))]];
      }
      if (normalized.startsWith('INSERT INTO subjects')) {
        const [semester_id, subject_code, subject_name, max_internal_marks, max_external_marks, total_maximum_marks, credits, status] = params;
        if (state.subjects.some((row) => row.semester_id === semester_id && row.subject_code === subject_code)) throw new Error('duplicate subject');
        const row = { id: state.nextSubjectId++, semester_id, subject_code, subject_name, max_internal_marks, max_external_marks, total_maximum_marks, credits, status };
        state.subjects.push(row);
        return [{ insertId: row.id, affectedRows: 1 }];
      }
      if (normalized.startsWith('INSERT INTO exam_sessions')) {
        const [semester_id, session_name, start_date, end_date, status] = params;
        const row = { id: state.nextSessionId++, semester_id, session_name, start_date, end_date, status };
        state.sessions.push(row);
        return [{ insertId: row.id, affectedRows: 1 }];
      }
      if (normalized.startsWith("SELECT usn, email FROM students WHERE usn LIKE 'TST%'")) return [[...state.students.filter((row) => row.usn.startsWith('TST')).map(({ usn, email }) => ({ usn, email }))]];
      if (normalized.startsWith('INSERT INTO students')) {
        const [usn, name, email, batch_id] = params;
        if (state.students.some((row) => row.usn === usn || row.email === email)) throw new Error('duplicate student');
        const row = { id: state.nextStudentId++, usn, name, email, batch_id };
        state.students.push(row);
        return [{ insertId: row.id, affectedRows: 1 }];
      }
      if (normalized.startsWith('SELECT id FROM results WHERE usn =')) {
        const [usn, subject_code, exam_session_id] = params;
        return [[...state.results.filter((row) => row.usn === usn && row.subject_code === subject_code && row.exam_session_id === exam_session_id).map(({ id }) => ({ id }))]];
      }
      if (normalized.startsWith('INSERT INTO results')) {
        if (state.failOnResultInsert) throw new Error('mock result insert failure');
        const [usn, subject_code, subject_name, marks_obtained, max_marks, grade, status, exam_session_id] = params;
        const row = { id: state.nextResultId++, usn, subject_code, subject_name, marks_obtained, max_marks, grade, status, exam_session_id };
        state.results.push(row);
        return [{ insertId: row.id, affectedRows: 1 }];
      }
      throw new Error(`Unhandled fixture SQL: ${normalized}`);
    },
    async beginTransaction() { before = snapshot(); state.transactions.began += 1; },
    async commit() { state.transactions.committed += 1; before = undefined; },
    async rollback() {
      state.transactions.rolledBack += 1;
      if (before) Object.assign(state, JSON.parse(JSON.stringify(before)));
      before = undefined;
    },
    release() { state.connectionReleased = true; }
  };
  const pool = { async getConnection() { state.connections = (state.connections || 0) + 1; return connection; } };
  const service = createService({
    getPool: () => pool,
    isDbDisabled: () => false,
    env: { NODE_ENV: 'test', ALLOW_TEST_DATA_GENERATION: 'true', DB_NAME: 'sras_test', TEST_DATA_DATABASE_NAME: 'sras_test' },
    random: () => 0.8
  });
  const request = (overrides = {}) => ({ batchId: 7, semesterId: 9, examSessionId: 11, subjectIds: [21], quantity: 2, ...overrides });
  return { state, service, request };
}

test('generation inserts synthetic students and calculated results atomically for selected relationships', async () => {
  const { state, service, request } = fixture();
  const result = await service.generateTestData(request());
  assert.equal(result.students.length, 2);
  assert.equal(result.resultCount, 2);
  assert.ok(state.students.every((row) => row.batch_id === 7));
  assert.ok(state.results.every((row) => state.students.some((student) => student.usn === row.usn && student.batch_id === 7)));
  assert.ok(state.results.every((row) => row.grade === 'A+' && row.status === 'Pass' && row.max_marks === 100));
  assert.deepEqual(state.transactions, { began: 1, committed: 1, rolledBack: 0 });
  assert.equal(state.connectionReleased, true);
});

test('invalid quantity is rejected before obtaining a database connection', async () => {
  const { state, service, request } = fixture();
  await assert.rejects(service.generateTestData(request({ quantity: 51 })), { status: 400 });
  assert.equal(state.connections, undefined);
});

test('missing batch is rejected', async () => {
  const { service, request } = fixture();
  await assert.rejects(service.generateTestData(request({ batchId: 999 })), { status: 404, message: 'Batch not found.' });
});

test('semester from another batch is rejected', async () => {
  const { service, request } = fixture({ state: { semesters: [{ id: 9, batch_id: 8, semester_number: 1, semester_name: 'Other' }] } });
  await assert.rejects(service.generateTestData(request()), { status: 422, message: 'Selected semester does not belong to the selected batch.' });
});

test('exam session from another semester is rejected', async () => {
  const { service, request } = fixture({ state: { sessions: [{ id: 11, semester_id: 10, session_name: 'Other' }] } });
  await assert.rejects(service.generateTestData(request()), { status: 422, message: 'Selected exam session does not belong to the selected semester.' });
});

test('subject from another semester is rejected', async () => {
  const { service, request } = fixture({ state: { subjects: [{ id: 21, semester_id: 10, subject_code: 'OTHER', subject_name: 'Other', max_internal_marks: 40, max_external_marks: 60, total_maximum_marks: 100 }] } });
  await assert.rejects(service.generateTestData(request()), { status: 422, message: 'Every selected subject must be active and belong to the selected semester.' });
});

test('optional synthetic subjects and exam session use the selected semester relationship', async () => {
  const { state, service, request } = fixture();
  const result = await service.generateTestData(request({ includeGeneratedAcademicItems: true, generatedSubjectCount: 2 }));
  assert.equal(result.generatedSubjects.length, 2);
  assert.equal(result.generatedExamSession.semester_id, 9);
  assert.ok(result.generatedSubjects.every((subject) => subject.semester_id === 9));
  assert.equal(result.resultCount, 6);
  assert.ok(state.results.every((row) => [11, result.generatedExamSession.id].includes(row.exam_session_id)));
});

test('result generation applies CIE/SEE component minimums but stores only combined marks', async () => {
  const values = [0.5, 1];
  const service = createService({ random: () => values.shift() });
  const record = await service.generateResultData(
    'TST000000000099',
    { subject_code: 'MCA101', subject_name: 'Algorithms', max_internal_marks: 40, max_external_marks: 60, total_maximum_marks: 100 },
    11,
    new Set()
  );
  assert.equal(record.marks_obtained, 80);
  assert.equal(record.grade, 'A+');
  assert.equal(record.status, 'Fail', 'CIE of 20 is below the 25 mark minimum');
  assert.equal(Object.hasOwn(record, 'cie'), false);
  assert.equal(Object.hasOwn(record, 'see'), false);
});

test('duplicate subjects and invalid generation counts are rejected', async () => {
  const { service, request } = fixture();
  await assert.rejects(service.generateTestData(request({ subjectIds: [21, 21] })), { status: 400, message: 'Duplicate subjects are not allowed.' });
  await assert.rejects(service.generateTestData(request({ quantity: '1.5' })), { status: 400 });
  await assert.rejects(service.generateTestData(request({ includeGeneratedAcademicItems: true, generatedSubjectCount: 6 })), { status: 400 });
});

test('synthetic student identifiers and result keys are not duplicated', async () => {
  const { state, service, request } = fixture({ state: {
    students: [{ id: 90, usn: 'TST000000000001', name: 'Prior synthetic', email: 'prior@example.test', batch_id: 7 }],
    results: [{ id: 90, usn: 'TST000000000002', subject_code: 'TST101', subject_name: 'Test Subject', marks_obtained: 50, max_marks: 100, grade: 'C', status: 'Pass', exam_session_id: 11 }]
  } });
  const result = await service.generateTestData(request({ quantity: 1 }));
  assert.equal(result.students[0].usn, 'TST000000000002');
  assert.equal(result.resultCount, 0);
  assert.equal(state.results.length, 1);
});

test('database errors roll back all newly inserted records and release the connection', async () => {
  const { state, service, request } = fixture({ state: { failOnResultInsert: true } });
  await assert.rejects(service.generateTestData(request({ includeGeneratedAcademicItems: true, generatedSubjectCount: 2 })));
  assert.equal(state.students.length, 0);
  assert.equal(state.results.length, 0);
  assert.equal(state.subjects.length, 2);
  assert.equal(state.sessions.length, 1);
  assert.deepEqual(state.transactions, { began: 1, committed: 0, rolledBack: 1 });
  assert.equal(state.connectionReleased, true);
});

test('production and mismatched database configurations block writes before connection', async () => {
  const { state, service, request } = fixture();
  const serviceWithEnv = createService({
    getPool: () => ({ getConnection: async () => { throw new Error('should not connect'); } }),
    isDbDisabled: () => false,
    env: { NODE_ENV: 'production', ALLOW_TEST_DATA_GENERATION: 'true', DB_NAME: 'production', TEST_DATA_DATABASE_NAME: 'production' }
  });
  await assert.rejects(serviceWithEnv.generateTestData(request()), { status: 403 });
  const mismatched = createService({
    getPool: () => ({ getConnection: async () => { throw new Error('should not connect'); } }),
    isDbDisabled: () => false,
    env: { NODE_ENV: 'test', ALLOW_TEST_DATA_GENERATION: 'true', DB_NAME: 'smart_result_analysis', TEST_DATA_DATABASE_NAME: 'sras_test' }
  });
  await assert.rejects(mismatched.generateTestData(request()), { status: 403 });
  const development = createService({
    getPool: () => ({ getConnection: async () => { throw new Error('should not connect'); } }),
    isDbDisabled: () => false,
    env: { NODE_ENV: 'development', ALLOW_TEST_DATA_GENERATION: 'true', DB_NAME: 'smart_result_development', TEST_DATA_DATABASE_NAME: 'smart_result_development' }
  });
  await assert.rejects(development.generateTestData(request()), { status: 403 });
  assert.equal(state.connections, undefined);
});

test('controller returns JSON success and error responses', async () => {
  const controller = require('../controllers/generatorController');
  const service = require('../services/generatorService');
  const original = service.generateTestData;
  const invoke = async (handler, req) => {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler(req, response);
    return response;
  };
  try {
    service.generateTestData = async () => ({ students: [{ usn: 'TST000000000001' }], resultCount: 1, subjectCount: 1, batch: {}, semester: {}, examSession: {} });
    const success = await invoke(controller.generate, { body: {} });
    assert.equal(success.code, 201);
    assert.equal(success.body.success, true);
    service.generateTestData = async () => { const error = new Error('bad request'); error.status = 400; throw error; };
    const failure = await invoke(controller.generate, { body: {} });
    assert.equal(failure.code, 400);
    assert.deepEqual(failure.body, { success: false, message: 'bad request' });
  } finally {
    service.generateTestData = original;
  }
});

test('generator POST route authenticates, checks CSRF, and returns JSON', async (t) => {
  const express = require('express');
  const routes = require('../routes/generatorRoutes');
  const service = require('../services/generatorService');
  const original = service.generateTestData;
  service.generateTestData = async () => ({ students: [], resultCount: 0, subjectCount: 1, batch: {}, semester: {}, examSession: {} });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers.authorization === 'Bearer test-admin') req.session = { user: { role: 'Admin' }, _csrf: 'csrf-token' };
    else req.session = {};
    next();
  });
  app.use('/api/generator', routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => {
    service.generateTestData = original;
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/api/generator/generate`;
  const unauthorized = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauthorized.status, 401);
  const csrfFailure = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin', 'X-CSRF-Token': 'wrong' }, body: '{}' });
  assert.equal(csrfFailure.status, 400);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin', 'X-CSRF-Token': 'csrf-token' }, body: '{}' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('content-type').includes('application/json'), true);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.message, 'Generated 0 students and 0 results.');
});
