'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const express = require('express');
const extraction = require('../services/resultExtractionService');
const uploadService = require('../services/resultUploadService');
const uploadModel = require('../models/resultUploadModel');
const uploadController = require('../controllers/resultUploadController');
const uploadRoutes = require('../routes/resultUploadRoutes');

const knownRecord = {
  usn: '1MV25MC052', studentName: 'PRAFUL KRISHNAPPA VAJJARAMATTI', semesterNumber: 1,
  subjectCode: 'BMATS101', subjectName: 'MATHEMATICS FOR COMPUTING',
  internalMarks: 38, externalMarks: 54, total: 92, resultStatus: 'Pass'
};

function makePdf(lines) {
  const escape = (value) => value.replace(/([\\()])/g, '\\$1');
  const commands = ['BT', '/F1 10 Tf', '50 760 Td'];
  lines.forEach((line, index) => {
    if (index) commands.push('0 -14 Td');
    commands.push(`(${escape(line)}) Tj`);
  });
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

function excelBuffer(rows, type = 'xlsx') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'VTU Results');
  return XLSX.write(workbook, { type: 'buffer', bookType: type });
}

function mockReferences(overrides = {}) {
  return {
    students: new Map([['1MV25MC052', { usn: '1MV25MC052', name: 'PRAFUL KRISHNAPPA VAJJARAMATTI', batchId: 7 }]]),
    semesters: new Map([['7:1', { id: 11, batchId: 7, semesterNumber: 1, semesterName: 'Semester 1' }]]),
    subjects: new Map([['11:BMATS101', { semesterId: 11, subjectCode: 'BMATS101', subjectName: 'MATHEMATICS FOR COMPUTING', maxInternalMarks: 40, maxExternalMarks: 60 }]]),
    ...overrides
  };
}

test('VTU text extraction recognizes student metadata, Roman semester and multiple subject rows', () => {
  const records = extraction.parseVtuText([
    'VISVESVARAYA TECHNOLOGICAL UNIVERSITY', 'USN: 1MV25MC052',
    'Student Name: PRAFUL KRISHNAPPA VAJJARAMATTI', 'Semester: I',
    'Subject Code Subject Name Internal Marks External Marks Total Result',
    'BMATS101 MATHEMATICS FOR COMPUTING 38 54 92 PASS',
    'BCS102 DATA STRUCTURES 28 31 59 FAIL'
  ].join('\n'));
  assert.equal(records.length, 2);
  assert.equal(records[0].usn, '1MV25MC052');
  assert.equal(records[0].studentName, 'PRAFUL KRISHNAPPA VAJJARAMATTI');
  assert.equal(records[0].semesterNumber, 1);
  assert.equal(records[0].subjectCode, 'BMATS101');
  assert.equal(records[1].resultStatus, 'Fail');
});

test('VTU extraction assembles marks split across PDF lines and ignores announced dates', () => {
  const records = extraction.parseVtuText([
    'USN: 1MV25MC061', 'Student Name: SAMPLE STUDENT', 'Semester: 2',
    'MMC201 MACHINE LEARNING AND DATA ANALYTICS', 'USING PYTHON', '37', '14', '51',
    'MMC202 OBJECT ORIENTED PROGRAMMING USING JAVA 30 10 40 F 2026-09-22'
  ].join('\n'));
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(({ subjectCode, internalMarks, externalMarks, total }) => [subjectCode, internalMarks, externalMarks, total]), [
    ['MMC201', '37', '14', '51'], ['MMC202', '30', '10', '40']
  ]);
  assert.equal(records[1].resultStatus, 'Fail');
});

test('Excel extraction finds headers by label and handles multiple students and subjects', () => {
  const buffer = excelBuffer([
    ['Subject Name', 'Semester', 'USN', 'Result', 'External Marks', 'Student Name', 'Subject Code', 'Total', 'Internal Marks'],
    ['MATHEMATICS FOR COMPUTING', 1, '1MV25MC052', 'PASS', 54, 'PRAFUL KRISHNAPPA VAJJARAMATTI', 'BMATS101', 92, 38],
    ['DATA STRUCTURES', 1, '1MV25MC053', 'FAIL', 31, 'ANOTHER STUDENT', 'BCS102', 59, 28]
  ]);
  const records = extraction.parseWorkbook(buffer);
  assert.equal(records.length, 2);
  assert.equal(records[0].subjectCode, 'BMATS101');
  assert.equal(records[0].internalMarks, '38');
  assert.equal(records[1].usn, '1MV25MC053');
  assert.equal(records[1].resultStatus, 'FAIL');
  assert.ok(extraction.getZipUncompressedSize(buffer) > 0);
  const expandedWorkbook = Buffer.from(buffer);
  const directoryHeader = expandedWorkbook.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.notEqual(directoryHeader, -1);
  expandedWorkbook.writeUInt32LE(65 * 1024 * 1024, directoryHeader + 24);
  assert.equal(extraction.getZipUncompressedSize(expandedWorkbook), Infinity);
  assert.throws(() => extraction.validateFileEnvelope({
    originalname: 'expanded.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: expandedWorkbook
  }), { status: 413 });
  const legacyBuffer = excelBuffer([
    ['USN', 'Student Name', 'Semester', 'Subject Code', 'Subject Name', 'Internal Marks', 'External Marks', 'Total', 'Result'],
    ['1MV25MC052', 'PRAFUL KRISHNAPPA VAJJARAMATTI', 1, 'BMATS101', 'MATHEMATICS FOR COMPUTING', 38, 54, 92, 'PASS']
  ], 'xls');
  assert.equal(extraction.parseWorkbook(legacyBuffer).length, 1);
  assert.equal(extraction.validateFileEnvelope({ originalname: 'legacy.xls', mimetype: 'application/vnd.ms-excel', buffer: legacyBuffer }), 'excel');

  const metadataWorkbook = excelBuffer([
    ['USN', '1MV25MC052'], ['Student Name', 'PRAFUL KRISHNAPPA VAJJARAMATTI'], ['Semester', 1],
    ['Subject Code', 'Subject Name', 'Internal Marks', 'External Marks', 'Total', 'Result'],
    ['BMATS101', 'MATHEMATICS FOR COMPUTING', 38, 54, 92, 'PASS']
  ]);
  const metadataRecords = extraction.parseWorkbook(metadataWorkbook);
  assert.equal(metadataRecords.length, 1);
  assert.equal(metadataRecords[0].studentName, 'PRAFUL KRISHNAPPA VAJJARAMATTI');
  assert.equal(metadataRecords[0].usn, '1MV25MC052');
});

test('valid text PDF is parsed and scanned, corrupted or mislabeled documents are rejected', async () => {
  const pdf = makePdf([
    'VISVESVARAYA TECHNOLOGICAL UNIVERSITY', 'USN: 1MV25MC052',
    'Student Name: PRAFUL KRISHNAPPA VAJJARAMATTI', 'Semester: I',
    'BMATS101 MATHEMATICS FOR COMPUTING 38 54 92 PASS'
  ]);
  const parsed = await extraction.extractUploadedDocument({ originalname: 'vtu.pdf', mimetype: 'application/pdf', buffer: pdf });
  assert.equal(parsed.format, 'pdf');
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].total, '92');
  const multiStudent = extraction.parseVtuText([
    'USN: 1MV25MC052', 'Student Name: PRAFUL KRISHNAPPA VAJJARAMATTI', 'Semester: 1',
    'BMATS101 MATHEMATICS FOR COMPUTING 38 54 92 PASS',
    'USN: 1MV25MC053', 'Student Name: ANOTHER STUDENT', 'Semester: I',
    'BCS102 DATA STRUCTURES 18 31 49 FAIL'
  ].join('\n'));
  assert.equal(multiStudent.length, 2);
  assert.equal(multiStudent[1].usn, '1MV25MC053');
  assert.equal(multiStudent[1].resultStatus, 'Fail');
  const incomplete = extraction.parseVtuText('USN: 1MV25MC052\nStudent Name: PRAFUL KRISHNAPPA VAJJARAMATTI\nSemester: 1\nBMATS101 MATHEMATICS FOR COMPUTING 38 54');
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].internalMarks, '');
  assert.equal(incomplete[0].resultStatus, '');

  const blankPdf = makePdf([]);
  await assert.rejects(extraction.extractUploadedDocument({ originalname: 'scan.pdf', mimetype: 'application/pdf', buffer: blankPdf }), /no selectable text/i);
  await assert.rejects(extraction.extractUploadedDocument({ originalname: 'broken.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-not a document') }), /could not be read/i);
  await assert.rejects(extraction.extractUploadedDocument({ originalname: 'wrong.pdf', mimetype: 'application/pdf', buffer: excelBuffer([['bad']]) }), /extension, MIME type or file signature/i);
  await assert.rejects(extraction.extractUploadedDocument({ originalname: 'broken.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('broken')]) }), /file signature/i);
});

test('validation checks identity, semester, subject, marks, totals, status and duplicate pairs', async () => {
  const model = { getReferenceData: async () => mockReferences() };
  const valid = await uploadService.validateRecords([{ ...knownRecord }], { model });
  assert.equal(valid.validCount, 1);
  assert.equal(valid.validRecords[0].semesterId, 11);
  const passAlias = await uploadService.validateRecords([{ ...knownRecord, resultStatus: 'P' }], { model });
  assert.equal(passAlias.validCount, 1);
  assert.equal(passAlias.validRecords[0].resultStatus, 'Pass');

  const invalidInputs = [
    { ...knownRecord, usn: '', studentName: '' },
    { ...knownRecord, usn: '1MV25MC999' },
    { ...knownRecord, studentName: 'A DIFFERENT PERSON' },
    { ...knownRecord, semesterNumber: 2 },
    { ...knownRecord, subjectCode: 'BCS102' },
    { ...knownRecord, subjectCode: '' },
    { ...knownRecord, subjectName: '' },
    { ...knownRecord, internalMarks: 'AB', externalMarks: -2, total: 150, resultStatus: 'Pending' },
    { ...knownRecord, internalMarks: 50 },
    { ...knownRecord, total: 91 }
  ];
  const result = await uploadService.validateRecords(invalidInputs, { model });
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, invalidInputs.length);
  assert.ok(result.invalidRecords.some((row) => row.validationErrors.some((error) => /not found/.test(error))));
  assert.ok(result.invalidRecords.some((row) => row.validationErrors.some((error) => /Internal marks exceed/.test(error))));
  assert.ok(result.invalidRecords.some((row) => row.validationErrors.some((error) => /do not equal/.test(error))));

  const duplicate = await uploadService.validateRecords([{ ...knownRecord }, { ...knownRecord }], { model });
  assert.equal(duplicate.invalidCount, 2);
  assert.ok(duplicate.invalidRecords.every((row) => row.validationErrors.some((error) => /Duplicate subject code/.test(error))));
});

test('upload preview rejects duplicate file bytes before reprocessing and never requires a storage path', async () => {
  const buffer = Buffer.from(`unique-preview-${Date.now()}-${Math.random()}`);
  const file = { originalname: 'in-memory.xlsx', buffer };
  const dependencies = {
    extractionService: { extractUploadedDocument: async () => ({ format: 'excel', records: [{ ...knownRecord }] }) },
    model: { getReferenceData: async () => mockReferences() }
  };
  const first = await uploadService.previewUploadedFile(file, dependencies);
  assert.equal(first.validCount, 1);
  assert.equal(first.fileName, 'in-memory.xlsx');
  await assert.rejects(uploadService.previewUploadedFile(file, dependencies), { status: 409 });
});

test('identical uploads arriving concurrently are only extracted once', async () => {
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  let release;
  const releasePromise = new Promise((resolve) => { release = resolve; });
  const file = { originalname: `concurrent-${Date.now()}.xlsx`, buffer: Buffer.from(`concurrent-${Math.random()}`) };
  const dependencies = {
    extractionService: { extractUploadedDocument: async () => { started(); await releasePromise; return { format: 'excel', records: [{ ...knownRecord }] }; } },
    model: { getReferenceData: async () => mockReferences() }
  };
  const first = uploadService.previewUploadedFile(file, dependencies);
  await startedPromise;
  await assert.rejects(uploadService.previewUploadedFile(file, dependencies), { status: 409 });
  release();
  const preview = await first;
  assert.equal(preview.validCount, 1);
  uploadService.cancelPreview(preview.uploadToken);
});

test('preview API is protected, CSRF checked and returns structured preview JSON', async (t) => {
  const service = require('../services/resultUploadService');
  const original = service.previewUploadedFile;
  service.previewUploadedFile = async (file) => ({ fileName: file.originalname, totalExtractedRecords: 0, validCount: 0, invalidCount: 0, records: [], validationErrors: [] });
  t.after(() => { service.previewUploadedFile = original; });
  const publicApp = express(); publicApp.use('/api/result-uploads', uploadRoutes);
  const publicServer = publicApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => publicServer.once('listening', resolve));
  t.after(() => publicServer.close());
  const denied = await fetch(`http://127.0.0.1:${publicServer.address().port}/api/result-uploads/preview`, { method: 'POST' });
  assert.equal(denied.status, 401);
  const deniedConfirmation = await fetch(`http://127.0.0.1:${publicServer.address().port}/api/result-uploads/confirm`, { method: 'POST' });
  assert.equal(deniedConfirmation.status, 401);

  const app = express();
  app.use((req, _res, next) => { req.session = { user: { username: 'preview-staff', role: 'Staff' }, _csrf: 'session-token' }; next(); });
  app.use('/api/result-uploads', uploadRoutes);
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const form = new FormData();
  form.append('batchId', '7'); form.append('semesterId', '11');
  form.append('resultFile', new Blob([excelBuffer([['data']])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'result.xlsx');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/result-uploads/preview`, {
    method: 'POST', body: form, headers: { 'x-csrf-token': 'session-token' }
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data.fileName, 'result.xlsx');
});

test('the protected upload page supports review, session selection, cancellation, and confirmation', () => {
  const html = require('node:fs').readFileSync(require.resolve('../public/result-upload.html'), 'utf8');
  const js = require('node:fs').readFileSync(require.resolve('../public/js/result-upload.js'), 'utf8');
  assert.match(html, /accept="[^"]*\.pdf[^"]*\.xls[^"]*\.xlsx/);
  assert.match(html, /confirm and save all results/i);
  assert.match(html, /previewRowsValid/);
  assert.match(html, /previewRowsInvalid/);
  assert.match(html, /duplicateRecordCount/);
  assert.match(html, /Exam session/);
  assert.match(js, /api\/result-uploads\/preview/);
  assert.match(js, /api\/result-uploads\/validate-session/);
  assert.match(js, /api\/result-uploads\/revalidate-selection/);
  assert.match(js, /api\/result-uploads\/confirm/);
});

test('confirmation uses Phase 9 status rules and rejects mismatched subject names', async () => {
  const wrongName = await uploadService.validateRecords([{ ...knownRecord, subjectName: 'UNRELATED SUBJECT' }], { model: { getReferenceData: async () => mockReferences() } });
  assert.equal(wrongName.invalidCount, 1);
  assert.ok(wrongName.invalidRecords[0].validationErrors.some((message) => /subject name does not match/i.test(message)));
  const wrongStatus = await uploadService.validateRecords([{ ...knownRecord, internalMarks: 10, externalMarks: 20, total: 30, resultStatus: 'Pass' }], { model: { getReferenceData: async () => mockReferences() } });
  assert.equal(wrongStatus.invalidCount, 1);
  assert.ok(wrongStatus.invalidRecords[0].validationErrors.some((message) => /Phase 9 calculation/i.test(message)));
});

test('valid PDF confirmation maps the existing semester exam session and saves once', async () => {
  const pdf = makePdf(['USN: 1MV25MC052', 'Student Name: PRAFUL KRISHNAPPA VAJJARAMATTI', 'Semester: 1', 'BMATS101 MATHEMATICS FOR COMPUTING 38 54 92 PASS']);
  const model = {
    getReferenceData: async () => mockReferences(),
    getExamSessions: async (ids) => ids.map((semesterId) => ({ id: 41, semesterId, sessionName: '2026 Regular', status: 'Active' }))
  };
  const resultService = { createResultsBatchService: async (records) => ({ savedCount: records.length, resultIds: [900] }) };
  const preview = await uploadService.previewUploadedFile({ originalname: `confirm-${Date.now()}.pdf`, mimetype: 'application/pdf', buffer: pdf }, { model });
  assert.equal(preview.validCount, 1);
  const choices = await uploadService.getSessions(preview.uploadToken, { model });
  assert.deepEqual(choices.sessions.map((row) => row.id), [41]);
  const saved = await uploadService.confirmUpload({ uploadToken: preview.uploadToken, sessionMappings: { 11: 41 } }, { model, resultService });
  assert.equal(saved.savedCount, 1);
  await assert.rejects(uploadService.confirmUpload({ uploadToken: preview.uploadToken, sessionMappings: { 11: 41 } }, { model, resultService }), { status: 410 });
});

test('a second confirmation or cancellation cannot race an active save', async () => {
  const file = { originalname: `confirmation-race-${Date.now()}.xlsx`, buffer: Buffer.from(`confirmation-race-${Math.random()}`) };
  const model = {
    getReferenceData: async () => mockReferences(),
    getExamSessions: async (ids) => ids.map((semesterId) => ({ id: 51, semesterId, sessionName: '2026 Regular' }))
  };
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  let release;
  const releasePromise = new Promise((resolve) => { release = resolve; });
  const resultService = { createResultsBatchService: async (rows) => { started(); await releasePromise; return { savedCount: rows.length, resultIds: [901] }; } };
  const preview = await uploadService.previewUploadedFile(file, {
    model, extractionService: { extractUploadedDocument: async () => ({ format: 'excel', records: [{ ...knownRecord }] }) }
  });
  const first = uploadService.confirmUpload({ uploadToken: preview.uploadToken, sessionMappings: { 11: 51 } }, { model, resultService });
  await startedPromise;
  await assert.rejects(uploadService.confirmUpload({ uploadToken: preview.uploadToken, sessionMappings: { 11: 51 } }, { model, resultService }), { status: 409 });
  assert.throws(() => uploadService.cancelPreview(preview.uploadToken), { status: 409 });
  release();
  const saved = await first;
  assert.equal(saved.savedCount, 1);
});

test('valid Excel confirmation saves multiple students and subjects in one batch', async () => {
  const records = [
    { ...knownRecord },
    { ...knownRecord, subjectCode: 'BCS102', subjectName: 'DATA STRUCTURES', internalMarks: 18, externalMarks: 31, total: 49, resultStatus: 'Fail' },
    { ...knownRecord, usn: '1MV25MC053', studentName: 'ANOTHER STUDENT' }
  ];
  const refs = mockReferences({
    students: new Map([
      ['1MV25MC052', { usn: '1MV25MC052', name: 'PRAFUL KRISHNAPPA VAJJARAMATTI', batchId: 7 }],
      ['1MV25MC053', { usn: '1MV25MC053', name: 'ANOTHER STUDENT', batchId: 7 }]
    ]),
    subjects: new Map([
      ['11:BMATS101', { semesterId: 11, subjectCode: 'BMATS101', subjectName: 'MATHEMATICS FOR COMPUTING', maxInternalMarks: 40, maxExternalMarks: 60 }],
      ['11:BCS102', { semesterId: 11, subjectCode: 'BCS102', subjectName: 'DATA STRUCTURES', maxInternalMarks: 40, maxExternalMarks: 60 }]
    ])
  });
  const model = { getReferenceData: async () => refs, getExamSessions: async (ids) => ids.map((semesterId) => ({ id: 45, semesterId, sessionName: '2026 Regular', status: 'Active' })) };
  let batch;
  const resultService = { createResultsBatchService: async (rows) => { batch = rows; return { savedCount: rows.length, resultIds: [1, 2, 3] }; } };
  const xlsx = excelBuffer([
    ['USN', 'Student Name', 'Semester', 'Subject Code', 'Subject Name', 'Internal Marks', 'External Marks', 'Total', 'Result'],
    ...records.map((record) => [record.usn, record.studentName, record.semesterNumber, record.subjectCode, record.subjectName, record.internalMarks, record.externalMarks, record.total, record.resultStatus])
  ]);
  const preview = await uploadService.previewUploadedFile({ originalname: `multi-${Date.now()}.xlsx`, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx }, { model });
  assert.equal(preview.validCount, 3);
  const saved = await uploadService.confirmUpload({ uploadToken: preview.uploadToken, sessionMappings: { 11: 45 } }, { model, resultService });
  assert.equal(saved.savedCount, 3);
  assert.equal(batch.length, 3);
  assert.equal(batch[1].exam_session_id, 45);
  assert.equal(batch[1].max_marks, 100);
});

test('confirmation blocks all invalid rows, missing sessions, and an existing-session mismatch', async () => {
  const records = [{ ...knownRecord }, { ...knownRecord, usn: 'UNKNOWNUSN1' }];
  const model = {
    getReferenceData: async () => mockReferences(),
    getExamSessions: async (ids) => ids.map((semesterId) => ({ id: 41, semesterId, sessionName: '2026 Regular' }))
  };
  const resultService = { createResultsBatchService: async () => { throw new Error('must not save'); } };
  const preview = await uploadService.previewUploadedFile({ originalname: `invalid-${Date.now()}.xls`, mimetype: 'application/vnd.ms-excel', buffer: excelBuffer([['unused']]) }, {
    model, extractionService: { extractUploadedDocument: async () => ({ format: 'excel', records }) }
  });
  assert.equal(preview.invalidCount, 1);
  await assert.rejects(uploadService.confirmUpload({ uploadToken: preview.uploadToken, sessionMappings: { 11: 41 } }, { model, resultService }), { status: 422 });
  const validPreview = await uploadService.previewUploadedFile({ originalname: `session-${Date.now()}.xls`, mimetype: 'application/vnd.ms-excel', buffer: Buffer.from(`valid-${Math.random()}`) }, {
    model, extractionService: { extractUploadedDocument: async () => ({ format: 'excel', records: [{ ...knownRecord }] }) }
  });
  await assert.rejects(uploadService.confirmUpload({ uploadToken: validPreview.uploadToken, sessionMappings: {} }, { model, resultService }), { status: 400 });
  await assert.rejects(uploadService.confirmUpload({ uploadToken: validPreview.uploadToken, sessionMappings: { 11: 999 } }, { model, resultService }), { status: 400 });
});

test('batch database service commits atomically, rejects existing keys, and rolls back a failed insert', async () => {
  const service = require('../services/resultService');
  const created = [];
  let rollbackCount = 0;
  let commitCount = 0;
  let exists = false;
  let failOnInsert = false;
  const connection = {
    execute: async (sql) => [[{ acquired: 1 }]],
    beginTransaction: async () => {},
    commit: async () => { commitCount += 1; },
    rollback: async () => { rollbackCount += 1; },
    release: () => {}
  };
  const resultModel = {
    resultExists: async () => exists,
    createResult: async (record) => { if (failOnInsert) throw new Error('insert failure'); created.push(record); return created.length; }
  };
  const base = {
    usn: '1MV25MC052', subject_code: 'BMATS101', subject_name: 'MATHEMATICS FOR COMPUTING',
    marks_obtained: 92, max_marks: 100, internal_marks: 38, external_marks: 54,
    max_internal_marks: 40, max_external_marks: 60, status: 'Pass', exam_session_id: 41
  };
  const deps = { getPool: () => ({ getConnection: async () => connection }), isDbDisabled: () => false, resultModel };
  const saved = await service.createResultsBatchService([base, {
    ...base, subject_code: 'BCS102', subject_name: 'DATA STRUCTURES', marks_obtained: 150, max_marks: 200,
    internal_marks: 70, external_marks: 80, max_internal_marks: 100, max_external_marks: 100
  }], deps);
  assert.equal(saved.savedCount, 2);
  assert.equal(commitCount, 1);
  assert.equal(created[1].grade, 'A');
  exists = true;
  await assert.rejects(service.createResultsBatchService([base], deps), { status: 409 });
  assert.equal(rollbackCount, 1);
  exists = false; failOnInsert = true;
  await assert.rejects(service.createResultsBatchService([base], deps), /insert failure/);
  assert.equal(rollbackCount, 2);
  await assert.rejects(service.createResultsBatchService([base, base], deps), { status: 409 });
});
