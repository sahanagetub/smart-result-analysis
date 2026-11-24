'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const extractionRoutes = require('../routes/resultExtractionRoutes');
const confirmationService = require('../services/resultExtractionConfirmationService');
const resultService = require('../services/resultService');

const selection = { batchId: 2, semesterId: 12, examSessionId: 23 };
const student = { student: { usn: '1MV25MC052', name: 'SAMPLE STUDENT' }, extractedSemester: 1, subjects: [
  { subjectCode: 'MMC101', subjectName: 'PROGRAMMING IN C', internalMarks: 38, externalMarks: 54, totalMarks: 92, result: 'P' }
] };

function makeReferences(overrides = {}) {
  return {
    students: [{ id: 52, usn: student.student.usn, name: student.student.name, batchId: 2 }],
    subjects: [{ id: 101, subjectCode: 'MMC101', subjectName: 'PROGRAMMING IN C', maxInternalMarks: 40, maxExternalMarks: 60, totalMaximumMarks: 100 }],
    ...overrides
  };
}

function makeModel({ context = true, references = makeReferences(), onReferenceRead } = {}) {
  let reads = 0;
  return {
    getSelectionContext: async (batchId, semesterId, examSessionId, executor) => context
      ? { batchId, batchName: 'MCA 2025-2027', semesterId, semesterNumber: 1, semesterName: 'Semester 1', examSessionId, examSessionName: '2026 Regular', locked: Boolean(executor) }
      : null,
    getValidationReferenceData: async (_batchId, _semesterId, _usns, executor) => {
      reads += 1;
      return onReferenceRead ? onReferenceRead(reads, Boolean(executor)) : references;
    }
  };
}

function makeTransactionResultService({ duplicate = false, failOnInsert = 0 } = {}) {
  const counters = { begin: 0, commit: 0, rollback: 0, inserted: [], persisted: [] };
  const connection = {
    execute: async () => [[{ acquired: 1 }]],
    beginTransaction: async () => { counters.begin += 1; },
    commit: async () => { counters.commit += 1; counters.persisted.push(...counters.inserted); counters.inserted = []; },
    rollback: async () => { counters.rollback += 1; counters.inserted = []; },
    release: () => {}
  };
  const resultModel = {
    resultExists: async () => duplicate || counters.persisted.some((row) => row.usn === student.student.usn),
    createResult: async (record) => {
      if (failOnInsert && counters.inserted.length + 1 === failOnInsert) throw new Error('simulated insert failure');
      counters.inserted.push(record); return counters.inserted.length;
    }
  };
  const service = {
    createResultsBatchService: (records, options) => resultService.createResultsBatchService(records, {
      getPool: () => ({ getConnection: async () => connection }),
      isDbDisabled: () => false,
      resultModel,
      beforeInsert: options.beforeInsert
    })
  };
  return { service, counters };
}

test('valid confirmation recalculates values and commits all valid records atomically', async () => {
  const { service, counters } = makeTransactionResultService();
  const saved = await confirmationService.confirmExtractedResults({ selection, students: [student] }, {
    model: makeModel(), resultService: service
  });
  assert.equal(counters.begin, 1);
  assert.equal(counters.commit, 1);
  assert.equal(counters.rollback, 0);
  assert.equal(counters.persisted.length, 1);
  assert.equal(counters.persisted[0].marks_obtained, 92);
  assert.equal(counters.persisted[0].status, 'Pass');
  assert.equal(counters.persisted[0].exam_session_id, 23);
  assert.deepEqual({ processed: saved.processedStudentCount, saved: saved.savedCount, failed: saved.failedRecordCount }, { processed: 1, saved: 1, failed: 0 });
});

test('confirmation rejects invalid students, subjects, sessions and marks before opening a save transaction', async () => {
  let calls = 0;
  const resultService = { createResultsBatchService: async () => { calls += 1; } };
  const scenarios = [
    { model: makeModel({ references: makeReferences({ students: [] }) }), data: [student], pattern: /Unknown USN/ },
    { model: makeModel({ references: makeReferences({ subjects: [] }) }), data: [student], pattern: /Unknown subject code/ },
    { model: makeModel({ context: false }), data: [student], pattern: /batch, semester and exam session/ },
    { model: makeModel(), data: [{ ...student, subjects: [{ ...student.subjects[0], internalMarks: 41 }] }], pattern: /Internal marks exceeds/ },
    { model: makeModel(), data: [{ ...student, subjects: [...student.subjects, { ...student.subjects[0], subjectName: 'Other label' }] }], pattern: /Duplicate subject code/ }
  ];
  for (const scenario of scenarios) {
    await assert.rejects(confirmationService.confirmExtractedResults({ selection, students: scenario.data }, {
      model: scenario.model, resultService
    }), (error) => error.status === 400 || error.status === 422 ? scenario.pattern.test(error.message) : false);
  }
  assert.equal(calls, 0);
});

test('confirmation-time mapping changes and duplicate results roll back without partial writes', async () => {
  let reads = 0;
  const changedModel = makeModel({ onReferenceRead: (_read, locked) => {
    reads += 1;
    return makeReferences({ students: [{ ...makeReferences().students[0], batchId: locked ? 9 : 2 }] });
  } });
  const changedTx = makeTransactionResultService();
  await assert.rejects(confirmationService.confirmExtractedResults({ selection, students: [student] }, {
    model: changedModel, resultService: changedTx.service
  }), { status: 409 });
  assert.equal(changedTx.counters.commit, 0);
  assert.equal(changedTx.counters.rollback, 1);
  assert.equal(changedTx.counters.persisted.length, 0);

  const duplicateTx = makeTransactionResultService({ duplicate: true });
  await assert.rejects(confirmationService.confirmExtractedResults({ selection, students: [student] }, {
    model: makeModel(), resultService: duplicateTx.service
  }), { status: 409 });
  assert.equal(duplicateTx.counters.rollback, 1);
  assert.equal(duplicateTx.counters.persisted.length, 0);
});

test('a database insert failure rolls back every staged result', async () => {
  const secondSubject = { ...student.subjects[0], subjectCode: 'MMC102', subjectName: 'DATABASE SYSTEMS', internalMarks: 35, externalMarks: 45, totalMarks: 80 };
  const data = [{ ...student, subjects: [...student.subjects, secondSubject] }];
  const model = makeModel({ references: makeReferences({ subjects: [
    ...makeReferences().subjects,
    { id: 102, subjectCode: 'MMC102', subjectName: 'DATABASE SYSTEMS', maxInternalMarks: 40, maxExternalMarks: 60, totalMaximumMarks: 100 }
  ] }) });
  const tx = makeTransactionResultService({ failOnInsert: 2 });
  await assert.rejects(confirmationService.confirmExtractedResults({ selection, students: data }, { model, resultService: tx.service }), /simulated insert failure/);
  assert.equal(tx.counters.rollback, 1);
  assert.equal(tx.counters.persisted.length, 0);
});

test('confirmation API requires authentication, staff access and CSRF and returns the commit summary', async (t) => {
  const original = confirmationService.confirmExtractedResults;
  confirmationService.confirmExtractedResults = async () => ({ processedStudentCount: 1, savedCount: 1, failedRecordCount: 0, resultIds: [44] });
  t.after(() => { confirmationService.confirmExtractedResults = original; });

  const unauthApp = express(); unauthApp.use('/api/result-extractions', extractionRoutes);
  const unauthServer = unauthApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => unauthServer.once('listening', resolve));
  t.after(() => unauthServer.close());
  const denied = await fetch(`http://127.0.0.1:${unauthServer.address().port}/api/result-extractions/confirm`, { method: 'POST' });
  assert.equal(denied.status, 401);

  const app = express();
  app.use((req, _res, next) => { req.session = { user: { username: 'phase16-staff', role: 'Staff' }, _csrf: 'phase16-token' }; next(); });
  app.use('/api/result-extractions', extractionRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/result-extractions/confirm`;
  const noCsrf = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 400);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'phase16-token' }, body: '{}' });
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.data.savedCount, 1);
  assert.match(payload.message, /saved successfully/i);
});

test('repeated confirmation is rejected by existing result duplicate protection', async () => {
  const tx = makeTransactionResultService();
  const deps = { model: makeModel(), resultService: tx.service };
  await confirmationService.confirmExtractedResults({ selection, students: [student] }, deps);
  await assert.rejects(confirmationService.confirmExtractedResults({ selection, students: [student] }, deps), { status: 409 });
  assert.equal(tx.counters.persisted.length, 1);
  assert.equal(tx.counters.rollback, 1);
});
