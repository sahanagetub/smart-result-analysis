'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const extraction = require('../services/resultPdfExtractionService');
const validation = require('../services/resultValidationService');
const resultExtractionModel = require('../models/resultExtractionModel');
const extractionRoutes = require('../routes/resultExtractionRoutes');
const { makeSyntheticResultPdf } = require('./fixtures/syntheticResultPdf');

const selection = { batchId: 4, semesterId: 9, examSessionId: 15 };
const refs = {
  getSelectionContext: async () => ({
    batchId: 4, batchName: 'Synthetic Test Batch', semesterId: 9, semesterNumber: 1,
    semesterName: 'Synthetic Semester One', examSessionId: 15, examSessionName: 'Synthetic Test Session'
  }),
  getValidationReferenceData: async () => ({
    students: [
      { id: 101, usn: '1MV25MC001', name: 'SYNTHETIC STUDENT ONE', batchId: 4 },
      { id: 102, usn: '1MV25MC002', name: 'SYNTHETIC STUDENT TWO', batchId: 4 }
    ],
    subjects: [
      { id: 201, subjectCode: 'SYN101', subjectName: 'SYNTHETIC SUBJECT ONE', maxInternalMarks: 50, maxExternalMarks: 50, totalMaximumMarks: 100 },
      { id: 202, subjectCode: 'SYN102', subjectName: 'SYNTHETIC SUBJECT TWO', maxInternalMarks: 50, maxExternalMarks: 50, totalMaximumMarks: 100 }
    ]
  })
};

test('synthetic test PDF extracts multiple invented students and multiple subjects without persistence', async () => {
  let referenceReads = 0;
  const model = {
    ...refs,
    getSelectionContext: async (...args) => { referenceReads += 1; return refs.getSelectionContext(...args); }
  };
  const file = {
    originalname: 'synthetic-test-results.pdf', mimetype: 'application/pdf',
    buffer: makeSyntheticResultPdf([
      'USN: 1MV25MC001', 'Student Name: SYNTHETIC STUDENT ONE', 'Semester: 1',
      'SYN101 SYNTHETIC SUBJECT ONE 45 40 85 P', 'SYN102 SYNTHETIC SUBJECT TWO 42 38 80 P',
      'USN: 1MV25MC002', 'Student Name: SYNTHETIC STUDENT TWO', 'Semester: 1',
      'SYN101 SYNTHETIC SUBJECT ONE 20 10 30 F'
    ])
  };
  const preview = await extraction.extractPdf(file, selection, { model });
  assert.equal(preview.students.length, 2);
  assert.deepEqual(preview.students.map((student) => student.student.usn), ['1MV25MC001', '1MV25MC002']);
  assert.deepEqual(preview.students.map((student) => student.subjects.length), [2, 1]);
  assert.equal(preview.students[1].subjects[0].totalMarks, 30);
  const checked = await validation.validateExtraction(selection, preview.students, { model });
  assert.match(checked.records[1].warnings.join(' '), /SYN102/);
  assert.equal(referenceReads, 2);
  assert.equal(Object.hasOwn(preview, 'resultIds'), false);
});

test('synthetic PDF preview validation catches mismatched context, duplicate and unknown subjects, and invalid marks', async () => {
  const file = {
    originalname: 'synthetic-invalid-test.pdf', mimetype: 'application/pdf',
    buffer: makeSyntheticResultPdf([
      'USN: 1MV25MC001', 'Student Name: SYNTHETIC STUDENT ONE', 'Semester: 2',
      'SYN101 SYNTHETIC SUBJECT ONE 55 40 95 P',
      'SYN101 SYNTHETIC SUBJECT ONE 45 40 85 P',
      'SYN999 UNCONFIGURED SUBJECT 20 10 30 F'
    ])
  };
  const preview = await extraction.extractPdf(file, selection, { model: refs });
  const checked = await validation.validateExtraction(selection, preview.students, { model: refs });
  assert.equal(checked.invalidCount, 1);
  const messages = [
    ...checked.invalidRecords[0].errors,
    ...checked.invalidRecords[0].subjects.flatMap((subject) => subject.errors)
  ].join(' ');
  assert.match(messages, /does not match selected semester/);
  assert.match(messages, /Duplicate subject code/);
  assert.match(messages, /Unknown subject code/);
  assert.match(messages, /exceeds the configured maximum/);
});

test('synthetic PDF fixture labels itself as test-only and is not used as actual academic data', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('./fixtures/syntheticResultPdf'), 'utf8');
  assert.match(source, /Synthetic fixture for automated tests only/);
  assert.match(source, /not an actual student transcript/);
});

test('synthetic PDF uploads through the authenticated CSRF-protected preview route without saving results', async (t) => {
  const express = require('express');
  const originalContext = resultExtractionModel.getSelectionContext;
  resultExtractionModel.getSelectionContext = refs.getSelectionContext;
  t.after(() => { resultExtractionModel.getSelectionContext = originalContext; });
  const app = express();
  app.use((req, _res, next) => {
    req.session = { user: { username: 'synthetic-test-staff', role: 'Staff' }, _csrf: 'synthetic-test-token' };
    next();
  });
  app.use('/api/result-extractions', extractionRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());

  const form = new FormData();
  form.append('batchId', String(selection.batchId));
  form.append('semesterId', String(selection.semesterId));
  form.append('examSessionId', String(selection.examSessionId));
  form.append('resultPdf', new Blob([makeSyntheticResultPdf([
    'USN: 1MV25MC001', 'Student Name: SYNTHETIC STUDENT ONE', 'Semester: 1',
    'SYN101 SYNTHETIC SUBJECT ONE 45 40 85 P'
  ])], { type: 'application/pdf' }), 'synthetic-test-only.pdf');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/result-extractions/preview`, {
    method: 'POST', headers: { 'x-csrf-token': 'synthetic-test-token' }, body: form
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.data.students[0].student.usn, '1MV25MC001');
  assert.equal(payload.data.subjects[0].subjectCode, 'SYN101');
  assert.match(payload.message, /No records have been saved/);
  assert.equal(Object.hasOwn(payload.data, 'resultIds'), false);
});
