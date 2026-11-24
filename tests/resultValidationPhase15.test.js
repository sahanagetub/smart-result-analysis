'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecords } = require('../services/resultUploadService');
const uploadService = require('../services/resultUploadService');

const baseRecord = {
  usn: '1MV25MC052', studentName: 'PRAFUL KRISHNAPPA VAJJARAMATTI', semesterNumber: 1,
  subjectCode: 'BMATS101', subjectName: 'MATHEMATICS FOR COMPUTING',
  internalMarks: 38, externalMarks: 54, total: 92, resultStatus: 'Pass'
};
const selectedSemester = { id: 11, batchId: 7, semesterNumber: 1, semesterName: 'Semester 1' };
const referenceData = {
  students: new Map([['1MV25MC052', { id: 52, usn: baseRecord.usn, name: baseRecord.studentName, batchId: 7 }]]),
  semesters: new Map(), selectedSemester,
  subjects: new Map([['11:BMATS101', {
    id: 101, semesterId: 11, subjectCode: 'BMATS101', subjectName: baseRecord.subjectName,
    maxInternalMarks: 40, maxExternalMarks: 60, totalMaximumMarks: 100
  }]])
};
const model = { getReferenceData: async () => referenceData };
const selection = { batchId: 7, semesterId: 11 };
const validate = (records, refs = referenceData, chosen = selection) => validateRecords(records, {
  selection: chosen, model: { getReferenceData: async () => refs }
});

test('session validation identifies existing originals and repeated conflicting entries', async () => {
  const model = {
    getReferenceData: async () => referenceData,
    getExamSessions: async () => [{ id: 41, semesterId: 11, batchId: 7, sessionName: '2026 Regular' }]
  };
  const resultModel = {
    findExistingOriginalResult: async (studentId, subjectId, sessionId) =>
      studentId === 52 && subjectId === 101 && sessionId === 41
        ? { id: 5, sessionName: '2026 Regular' } : null
  };
  const buffer = Buffer.from(`duplicate-session-${Date.now()}-${Math.random()}`);
  const preview = await uploadService.previewUploadedFile({ originalname: 'duplicate.pdf', buffer }, {
    selection, model,
    extractionService: { extractUploadedDocument: async () => ({ format: 'pdf', records: [baseRecord] }) }
  });
  const checked = await uploadService.validatePreviewSession({ uploadToken: preview.uploadToken, sessionMappings: { 11: 41 } }, { model, resultModel });
  assert.equal(checked.duplicateCount, 1);
  assert.match(checked.invalidRecords[0].validationErrors.join(' '), /1MV25MC052.*BMATS101.*2026 Regular/i);
  uploadService.cancelPreview(preview.uploadToken);

  const repeated = await uploadService.previewUploadedFile({ originalname: 'repeated.pdf', buffer: Buffer.from(`repeat-${Date.now()}-${Math.random()}`) }, {
    selection, model,
    extractionService: { extractUploadedDocument: async () => ({ format: 'pdf', records: [baseRecord, { ...baseRecord, subjectName: 'ALTERNATE LABEL', internalMarks: 37, total: 91 }] }) }
  });
  assert.ok(repeated.invalidRecords.every((row) => row.validationErrors.some((message) => /Conflicting marks entries/.test(message))));
  const sessionChecked = await uploadService.validatePreviewSession({ uploadToken: repeated.uploadToken, sessionMappings: { 11: 41 } }, {
    model, resultModel: { findExistingOriginalResult: async () => null }
  });
  assert.ok(sessionChecked.invalidRecords.every((row) => row.validationErrors.some((message) => /Duplicate original result entry.*2026 Regular/.test(message))));
  uploadService.cancelPreview(repeated.uploadToken);
});

test('confirmation repeats reference and original-result checks inside the save transaction', async () => {
  let hasExisting = false;
  let currentReferences = referenceData;
  const model = {
    getReferenceData: async () => currentReferences,
    getExamSessions: async () => [{ id: 41, semesterId: 11, batchId: 7, sessionName: '2026 Regular' }],
    findExamSessionForUpdate: async () => ({ id: 41, semesterId: 11, batchId: 7, sessionName: '2026 Regular' })
  };
  const resultModel = {
    findExistingOriginalResult: async () => hasExisting ? { id: 8, sessionName: '2026 Regular' } : null
  };
  const preview = await uploadService.previewUploadedFile({ originalname: 'revalidate.pdf', buffer: Buffer.from(`revalidate-${Date.now()}-${Math.random()}`) }, {
    selection, model,
    extractionService: { extractUploadedDocument: async () => ({ format: 'pdf', records: [baseRecord] }) }
  });
  let insertCount = 0;
  const resultService = { createResultsBatchService: async (rows, { beforeInsert }) => {
    await beforeInsert({}); insertCount += rows.length; return { savedCount: rows.length, resultIds: [1] };
  } };
  hasExisting = true;
  await assert.rejects(uploadService.confirmUpload({ uploadToken: preview.uploadToken, sessionMappings: { 11: 41 } }, { model, resultModel, resultService }),
    (error) => error.status === 409 && /Original result already exists.*2026 Regular/.test(error.message));
  assert.equal(insertCount, 0);

  hasExisting = false;
  currentReferences = { ...referenceData, subjects: new Map([['11:BMATS101', {
    ...referenceData.subjects.get('11:BMATS101'), maxInternalMarks: 45
  }]]) };
  await assert.rejects(uploadService.confirmUpload({ uploadToken: preview.uploadToken, sessionMappings: { 11: 41 } }, { model, resultModel, resultService }),
    (error) => error.status === 409 && /configuration changed after preview/.test(error.message));
  assert.equal(insertCount, 0);
  currentReferences = {
    ...referenceData,
    students: new Map([['1MV25MC052', { ...referenceData.students.get('1MV25MC052'), batchId: 8 }]])
  };
  await assert.rejects(uploadService.confirmUpload({ uploadToken: preview.uploadToken, sessionMappings: { 11: 41 } }, { model, resultModel, resultService }),
    (error) => error.status === 409 && /belongs to another batch/i.test(error.message));
  assert.equal(insertCount, 0);
  uploadService.cancelPreview(preview.uploadToken);
});

test('final validation failures roll back the complete batch without inserts', async () => {
  const resultService = require('../services/resultService');
  let rollbacks = 0;
  let inserts = 0;
  const connection = {
    execute: async () => [[{ acquired: 1 }]],
    beginTransaction: async () => {}, commit: async () => {},
    rollback: async () => { rollbacks += 1; }, release: () => {}
  };
  const deps = {
    getPool: () => ({ getConnection: async () => connection }),
    isDbDisabled: () => false,
    resultModel: {
      resultExists: async () => false,
      createResult: async () => { inserts += 1; return inserts; }
    }
  };
  const row = {
    usn: baseRecord.usn, subject_code: baseRecord.subjectCode, subject_name: baseRecord.subjectName,
    marks_obtained: 92, max_marks: 100, internal_marks: 38, external_marks: 54,
    max_internal_marks: 40, max_external_marks: 60, status: 'Pass', exam_session_id: 41
  };
  await assert.rejects(resultService.createResultsBatchService([row], {
    ...deps, beforeInsert: async () => { throw Object.assign(new Error('Final reference check failed.'), { status: 409 }); }
  }), /Final reference check failed/);
  assert.equal(inserts, 0);
  assert.equal(rollbacks, 1);
});

test('session validation rejects an exam session attached to a different semester', async () => {
  const refsModel = {
    getReferenceData: async () => referenceData,
    getExamSessions: async () => [{ id: 77, semesterId: 12, batchId: 7, sessionName: 'Wrong semester session' }]
  };
  const preview = await uploadService.previewUploadedFile({ originalname: 'wrong-session.pdf', buffer: Buffer.from(`wrong-session-${Date.now()}`) }, {
    selection, model: refsModel,
    extractionService: { extractUploadedDocument: async () => ({ format: 'pdf', records: [baseRecord] }) }
  });
  const checked = await uploadService.validatePreviewSession({ uploadToken: preview.uploadToken, sessionMappings: { 11: 77 } }, {
    model: refsModel, resultModel: { findExistingOriginalResult: async () => null }
  });
  assert.equal(checked.validCount, 0);
  assert.match(checked.invalidRecords[0].validationErrors.join(' '), /session does not belong to semester/i);
  uploadService.cancelPreview(preview.uploadToken);
});

test('Phase 15 checks existing and unknown USNs and selected batch ownership', async () => {
  assert.equal((await validate([baseRecord])).validCount, 1);
  const unknown = await validate([{ ...baseRecord, usn: '1MV25MC999' }]);
  assert.match(unknown.invalidRecords[0].validationErrors.join(' '), /USN was not found/i);
  const otherBatch = await validate([baseRecord], {
    ...referenceData,
    students: new Map([['1MV25MC052', { ...referenceData.students.get('1MV25MC052'), batchId: 8 }]])
  });
  assert.match(otherBatch.invalidRecords[0].validationErrors.join(' '), /belongs to another batch/i);
});

test('Phase 15 checks selected semester membership and extracted semester number', async () => {
  assert.equal((await validate([baseRecord])).validCount, 1);
  const mismatch = await validate([{ ...baseRecord, semesterNumber: 2 }]);
  assert.match(mismatch.invalidRecords[0].validationErrors.join(' '), /does not match selected semester/i);
  const semesterOutsideBatch = await validate([baseRecord], {
    ...referenceData, selectedSemester: { ...selectedSemester, batchId: 8 }
  });
  assert.match(semesterOutsideBatch.invalidRecords[0].validationErrors.join(' '), /does not belong to the selected batch/i);
});

test('Phase 15 catches cross-record batch and semester conflicts for one USN', async () => {
  const base = { ...baseRecord, batchId: 7 };
  const conflictingBatch = await validate([base, { ...base, batchId: 8, subjectCode: 'BCS102', subjectName: 'DATA STRUCTURES' }]);
  assert.ok(conflictingBatch.invalidRecords.every((row) => row.validationErrors.some((message) => /Conflicting student mapping.*multiple batch values/i.test(message))));
  const conflictingSemester = await validate([base, { ...base, semesterNumber: 2, subjectCode: 'BCS102', subjectName: 'DATA STRUCTURES' }]);
  assert.ok(conflictingSemester.invalidRecords.every((row) => row.validationErrors.some((message) => /Conflicting student mapping.*multiple semester values/i.test(message))));
});

test('Phase 15 reports unknown and duplicate subject codes', async () => {
  const unknown = await validate([{ ...baseRecord, subjectCode: 'UNKNOWN1' }]);
  assert.match(unknown.invalidRecords[0].validationErrors.join(' '), /Unknown subject code UNKNOWN1/i);
  const duplicate = await validate([baseRecord, baseRecord]);
  assert.ok(duplicate.invalidRecords.every((row) => row.validationErrors.some((message) => /Duplicate subject code/i.test(message))));
});

test('Phase 15 identifies incomplete subject groups without rejecting supported partial results', async () => {
  const refs = {
    ...referenceData,
    subjects: new Map([...referenceData.subjects, ['11:BCS102', {
      semesterId: 11, subjectCode: 'BCS102', subjectName: 'DATA STRUCTURES',
      maxInternalMarks: 40, maxExternalMarks: 60, totalMaximumMarks: 100
    }]])
  };
  const result = await validate([baseRecord], refs);
  assert.equal(result.validCount, 1);
  assert.match(result.validRecords[0].validationWarnings.join(' '), /Incomplete result group.*BCS102.*Partial result uploads are allowed/i);
});

test('Phase 15 checks configured internal, external, total, negative and non-numeric marks', async () => {
  const cases = [
    [{ ...baseRecord, internalMarks: 41, total: 95 }, /Internal marks exceed/],
    [{ ...baseRecord, externalMarks: 61, total: 99 }, /External marks exceed/],
    [{ ...baseRecord, internalMarks: 40, externalMarks: 60, total: 101 }, /Total marks exceed/],
    [{ ...baseRecord, internalMarks: -1, total: 53 }, /non-negative/],
    [{ ...baseRecord, externalMarks: 'not numeric', total: 38 }, /non-negative number/]
  ];
  for (const [record, message] of cases) {
    const result = await validate([record]);
    assert.match(result.invalidRecords[0].validationErrors.join(' '), message);
  }
});
