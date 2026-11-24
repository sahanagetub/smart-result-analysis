'use strict';

const crypto = require('crypto');
const extractionService = require('./resultExtractionService');
const uploadModel = require('../models/resultUploadModel');
const resultCalculationService = require('./resultCalculationService');

const DUPLICATE_TTL_MS = 15 * 60 * 1000;
const MAX_RECENT_UPLOADS = 500;
const MAX_PENDING_PREVIEWS = 25;
const MAX_PENDING_PREVIEW_ROWS = 20000;
const recentUploads = new Map();
const processingUploadHashes = new Set();
const pendingPreviews = new Map();
const PREVIEW_TTL_MS = 30 * 60 * 1000;
let pendingPreviewRows = 0;

function uploadError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function asNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addError(errors, message) { errors.push(message); }

function normalizedText(value) { return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('en'); }

function removePendingPreview(token) {
  const preview = pendingPreviews.get(token);
  if (!preview) return false;
  pendingPreviews.delete(token);
  pendingPreviewRows = Math.max(0, pendingPreviewRows - preview.records.length);
  return true;
}

async function validateRecords(records, dependencies = {}) {
  const referenceModel = dependencies.model || uploadModel;
  const selection = dependencies.selection || {};
  const hasSelection = Number.isSafeInteger(Number(selection.batchId)) && Number(selection.batchId) > 0 && Number.isSafeInteger(Number(selection.semesterId)) && Number(selection.semesterId) > 0;
  const refs = await referenceModel.getReferenceData(records, hasSelection ? selection : {}, dependencies.executor || null);
  const duplicateRows = new Map();
  const sourceStudentMappings = new Map();
  for (const record of records) {
    const usnKey = String(record.usn || '').trim().toUpperCase();
    if (usnKey) {
      if (!sourceStudentMappings.has(usnKey)) sourceStudentMappings.set(usnKey, { batches: new Set(), semesters: new Set() });
      const mapping = sourceStudentMappings.get(usnKey);
      if (record.batchId !== undefined && record.batchId !== null && record.batchId !== '') mapping.batches.add(String(record.batchId));
      if (record.semesterNumber !== undefined && record.semesterNumber !== null && record.semesterNumber !== '') mapping.semesters.add(String(record.semesterNumber));
    }
    if (!record.usn || !record.semesterNumber || !record.subjectCode) continue;
    const key = `${String(record.usn).trim().toUpperCase()}:${record.semesterNumber}:${String(record.subjectCode).trim().toUpperCase()}`;
    if (!duplicateRows.has(key)) duplicateRows.set(key, []);
    duplicateRows.get(key).push(record);
  }
  const checked = records.map((source) => {
    const record = { ...source };
    const errors = [];
    const warnings = [];
    const usn = String(record.usn || '').trim().toUpperCase();
    const name = String(record.studentName || '').trim();
    const subjectCode = String(record.subjectCode || '').trim().toUpperCase();
    const subjectName = String(record.subjectName || '').trim();
    const semesterNumber = Number(record.semesterNumber);
    const internal = asNumber(record.internalMarks);
    const external = asNumber(record.externalMarks);
    const total = asNumber(record.total);
    const statusToken = String(record.resultStatus || '').trim().toUpperCase();
    const status = statusToken === 'P' || statusToken === 'PASSED' ? 'PASS' : statusToken === 'F' || statusToken === 'FAILED' ? 'FAIL' : statusToken;

    if (!usn) addError(errors, 'Missing student USN.');
    else if (!/^[A-Z0-9]{7,20}$/.test(usn)) addError(errors, 'USN must contain 7 to 20 letters or digits.');
    if (!name) addError(errors, 'Missing student name.');
    if (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 12) addError(errors, 'Semester must be a number from 1 to 12.');
    if (!subjectCode) addError(errors, 'Missing subject code.');
    else if (subjectCode.length > 20) addError(errors, 'Subject code exceeds 20 characters.');
    if (!subjectName) addError(errors, 'Missing subject name.');
    if (internal === null || internal < 0) addError(errors, 'Internal marks must be a non-negative number.');
    if (external === null || external < 0) addError(errors, 'External marks must be a non-negative number.');
    if (total === null || total < 0) addError(errors, 'Total marks must be a non-negative number.');
    if (internal !== null && external !== null && total !== null && Math.abs(internal + external - total) > 0.01) {
      addError(errors, 'Total marks do not equal internal plus external marks.');
    }
    if (!['PASS', 'FAIL'].includes(status)) addError(errors, 'Result must be Pass or Fail.');

    const duplicateKey = `${usn}:${semesterNumber}:${subjectCode}`;
    const duplicateGroup = duplicateRows.get(duplicateKey) || [];
    if (duplicateGroup.length > 1) {
      addError(errors, `Duplicate subject code ${subjectCode} appears more than once for ${usn} in this upload.`);
      const markSignatures = new Set(duplicateGroup.map((item) => `${item.internalMarks}|${item.externalMarks}|${item.total}`));
      if (markSignatures.size > 1) addError(errors, `Conflicting marks entries were extracted for ${usn}, subject ${subjectCode}. Review the source document; no entry was selected automatically.`);
    }
    if (hasSelection && record.batchId !== undefined && Number(record.batchId) !== Number(selection.batchId)) {
      addError(errors, `Extracted batch mapping for ${usn} conflicts with the selected batch.`);
    }

    let student = null;
    let semester = null;
    let subject = null;
    if (refs && usn) {
      student = refs.students.get(usn) || null;
      if (!student) addError(errors, 'USN was not found in the existing student database.');
      else if (hasSelection && Number(student.batchId) !== Number(selection.batchId)) addError(errors, `USN ${usn} belongs to another batch; select the student's batch.`);
      else if (student.name && name && normalizedText(student.name) !== normalizedText(name)) {
        addError(errors, 'Student name does not match the existing student record for this USN.');
      }
    }
    if (refs && student && Number.isInteger(semesterNumber)) {
      semester = hasSelection ? refs.selectedSemester : refs.semesters.get(`${student.batchId}:${semesterNumber}`) || null;
      if (!semester) addError(errors, 'Semester was not found for this student batch.');
      else if (hasSelection && Number(semester.batchId) !== Number(selection.batchId)) addError(errors, 'Selected semester does not belong to the selected batch.');
      else if (hasSelection && Number(semester.semesterNumber) !== semesterNumber) addError(errors, `Uploaded semester ${semesterNumber} does not match selected semester ${semester.semesterNumber}.`);
    }
    if (refs && semester && subjectCode) {
      subject = refs.subjects.get(`${semester.id}:${subjectCode}`) || null;
      if (!subject) addError(errors, `Unknown subject code ${subjectCode} for the selected semester.`);
    }
    if (subject && internal !== null && internal > subject.maxInternalMarks) addError(errors, `Internal marks exceed the configured maximum of ${subject.maxInternalMarks}.`);
    if (subject && external !== null && external > subject.maxExternalMarks) addError(errors, `External marks exceed the configured maximum of ${subject.maxExternalMarks}.`);
    const maxTotal = subject && Number(subject.totalMaximumMarks || (subject.maxInternalMarks + subject.maxExternalMarks));
    if (subject && total !== null && total > maxTotal) addError(errors, `Total marks exceed the configured maximum of ${maxTotal}.`);
    if (subject && (!(subject.maxInternalMarks > 0) || !(subject.maxExternalMarks > 0))) addError(errors, 'The subject has an invalid maximum-marks configuration.');
    if (subject && subjectName && normalizedText(subjectName) !== normalizedText(subject.subjectName)) {
      addError(errors, 'Subject name does not match the subject code in this semester.');
    }
    let computedGrade = null;
    if (internal !== null && external !== null && total !== null && subject) {
      const outcome = resultCalculationService.determineSubjectResult(internal, external, total);
      const extractedStatus = status === 'PASS' ? 'Pass' : status === 'FAIL' ? 'Fail' : '';
      if (extractedStatus && outcome.status !== extractedStatus) {
        addError(errors, `Extracted result status conflicts with the configured Phase 9 calculation (${outcome.status}).`);
      }
      computedGrade = resultCalculationService.calculateGrade((total / (subject.maxInternalMarks + subject.maxExternalMarks)) * 100);
      if (computedGrade === null) addError(errors, 'Marks cannot be calculated against the configured subject maximum.');
    }
    if (!refs) addError(errors, 'Database reference checks are unavailable; enable MySQL before accepting records.');

    record.usn = usn;
    record.studentName = name;
    record.semesterNumber = Number.isInteger(semesterNumber) ? semesterNumber : record.semesterNumber;
    record.subjectCode = subjectCode;
    record.subjectName = subjectName;
    record.internalMarks = internal === null ? record.internalMarks : internal;
    record.externalMarks = external === null ? record.externalMarks : external;
    record.total = total === null ? record.total : total;
    record.resultStatus = status === 'PASS' ? 'Pass' : status === 'FAIL' ? 'Fail' : record.resultStatus;
    if (student) { record.batchId = student.batchId; record.studentId = student.id; }
    if (semester) { record.semesterId = semester.id; record.semesterName = semester.semesterName; }
    if (subject) {
      record.subjectId = subject.id;
      record.maxInternalMarks = subject.maxInternalMarks;
      record.maxExternalMarks = subject.maxExternalMarks;
      record.totalMaximumMarks = subject.totalMaximumMarks || (subject.maxInternalMarks + subject.maxExternalMarks);
    }
    if (computedGrade) record.computedGrade = computedGrade;
    record.validationErrors = errors;
    record.validationWarnings = warnings;
    record.valid = errors.length === 0;
    record.duplicateOriginal = false;
    delete record.examSessionId;
    delete record.examSessionName;
    return record;
  });
  for (const row of checked) {
    const mapping = sourceStudentMappings.get(row.usn);
    if (!mapping) continue;
    if (mapping.batches.size > 1) {
      row.validationErrors.push(`Conflicting student mapping: USN ${row.usn} appears with multiple batch values in this upload.`);
      row.valid = false;
    }
    if (mapping.semesters.size > 1) {
      row.validationErrors.push(`Conflicting student mapping: USN ${row.usn} appears with multiple semester values in this upload.`);
      row.valid = false;
    }
  }
  if (hasSelection && refs?.selectedSemester && Number(refs.selectedSemester.batchId) === Number(selection.batchId)) {
    const configured = [...refs.subjects.values()].filter((subject) => subject.semesterId === refs.selectedSemester.id);
    const byStudent = new Map();
    for (const row of checked) {
      if (Number(row.batchId) !== Number(selection.batchId) || Number(row.semesterId) !== refs.selectedSemester.id) continue;
      if (!byStudent.has(row.usn)) byStudent.set(row.usn, new Set());
      byStudent.get(row.usn).add(row.subjectCode);
    }
    for (const [usn, codes] of byStudent) {
      const missing = configured.map((subject) => subject.subjectCode).filter((code) => !codes.has(code));
      if (!missing.length) continue;
      checked.filter((row) => row.usn === usn && Number(row.semesterId) === refs.selectedSemester.id).forEach((row) => {
        row.validationWarnings.push(`Incomplete result group: configured subject codes not present in this upload: ${missing.join(', ')}. Partial result uploads are allowed.`);
      });
    }
  }
  const validRecords = checked.filter((record) => record.valid);
  const invalidRecords = checked.filter((record) => !record.valid);
  return {
    records: checked, validRecords, invalidRecords,
    totalExtractedRecords: checked.length,
    validCount: validRecords.length,
    invalidCount: invalidRecords.length,
    validationErrors: checked.length ? [] : ['No VTU result rows were identified in this file. Check that it contains selectable text and recognizable subject rows.']
  };
}

function pruneDuplicateCache(now = Date.now()) {
  for (const [hash, timestamp] of recentUploads) if (now - timestamp > DUPLICATE_TTL_MS) recentUploads.delete(hash);
  while (recentUploads.size >= MAX_RECENT_UPLOADS) recentUploads.delete(recentUploads.keys().next().value);
  for (const [token, preview] of pendingPreviews) if (!preview.confirming && now - preview.createdAt > PREVIEW_TTL_MS) removePendingPreview(token);
}

async function previewUploadedFile(file, dependencies = {}) {
  const extractor = dependencies.extractionService || extractionService;
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const now = Date.now();
  pruneDuplicateCache(now);
  if (recentUploads.has(hash) || processingUploadHashes.has(hash)) throw uploadError('This file was already processed or is being processed. Select a different file or wait before retrying.', 409);
  processingUploadHashes.add(hash);
  try {
    const extracted = await extractor.extractUploadedDocument(file);
    if (extracted.records.length > 10000) throw uploadError('A single upload may contain at most 10,000 result rows.', 413);
    const validation = await validateRecords(extracted.records, { ...dependencies, selection: dependencies.selection || {} });
    pruneDuplicateCache(now);
    if (pendingPreviews.size >= MAX_PENDING_PREVIEWS || pendingPreviewRows + validation.records.length > MAX_PENDING_PREVIEW_ROWS) {
      throw uploadError('Pending previews are using the review capacity. Confirm or cancel an existing preview, then retry.', 429);
    }
    const uploadToken = crypto.randomUUID();
    const fileName = String(file.originalname || 'result file').split(/[\\/]/).pop();
    pendingPreviews.set(uploadToken, { createdAt: now, hash, ownerId: dependencies.ownerId || null, fileName, format: extracted.format, selection: dependencies.selection || null, records: validation.records, confirming: false });
    pendingPreviewRows += validation.records.length;
    recentUploads.set(hash, now);
    pruneDuplicateCache(now);
    return { fileName, format: extracted.format, ...validation, uploadToken };
  } finally {
    processingUploadHashes.delete(hash);
  }
}

// Phase 14 hands corrected, validated PDF rows to the same confirmation
// registry used by Phase 13. This does not write result rows.
async function createReviewedPreview(records, options = {}, dependencies = {}) {
  if (!Array.isArray(records) || records.length === 0) throw uploadError('There are no corrected result rows to confirm.', 400);
  if (records.length > 10000) throw uploadError('A review may contain at most 10,000 result rows.', 413);
  const validation = await validateRecords(records, dependencies);
  if (validation.invalidCount) throw uploadError('Correct all invalid rows before opening the confirmation step.', 422);
  pruneDuplicateCache();
  if (pendingPreviews.size >= MAX_PENDING_PREVIEWS || pendingPreviewRows + records.length > MAX_PENDING_PREVIEW_ROWS) {
    throw uploadError('Pending previews are using the review capacity. Confirm or cancel an existing preview, then retry.', 429);
  }
  const token = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(`${token}:${JSON.stringify(records)}`).digest('hex');
  const now = Date.now();
  pendingPreviews.set(token, {
    createdAt: now, hash, ownerId: options.ownerId || null,
    fileName: String(options.fileName || 'result.pdf').slice(0, 255), format: options.format || 'pdf', selection: options.selection || null,
    records: validation.records, confirming: false
  });
  pendingPreviewRows += validation.records.length;
  return { uploadToken: token, totalExtractedRecords: validation.totalExtractedRecords, validCount: validation.validCount, invalidCount: validation.invalidCount };
}

async function getSessions(uploadToken, dependencies = {}) {
  const preview = pendingPreviews.get(String(uploadToken || ''));
  if (!preview) throw uploadError('This preview expired or the server restarted. Upload the document again.', 410);
  if (preview.ownerId && preview.ownerId !== dependencies.ownerId) throw uploadError('This preview belongs to another signed-in session.', 403);
  const semesterIds = [...new Set(preview.records.filter((record) => record.semesterId).map((record) => record.semesterId))];
  const model = dependencies.model || uploadModel;
  return { sessions: await model.getExamSessions(semesterIds), semesterIds };
}

async function validatePreviewSession({ uploadToken, sessionMappings }, dependencies = {}) {
  const preview = pendingPreviews.get(String(uploadToken || ''));
  if (!preview) throw uploadError('This preview expired or the server restarted. Upload the document again.', 410);
  if (preview.ownerId && preview.ownerId !== dependencies.ownerId) throw uploadError('This preview belongs to another signed-in session.', 403);
  if (!sessionMappings || typeof sessionMappings !== 'object' || Array.isArray(sessionMappings)) throw uploadError('Choose an exam session for every semester before checking duplicates.');

  const model = dependencies.model || uploadModel;
  const validation = await validateRecords(preview.records, { model, selection: preview.selection || {} });
  const semesterIds = [...new Set(validation.records.filter((row) => row.semesterId).map((row) => Number(row.semesterId)))];
  const sessions = await model.getExamSessions(semesterIds);
  const checked = validation.records;
  const resultsModel = dependencies.resultModel || require('../models/resultModel');
  const sessionBySemester = new Map();
  for (const semesterId of semesterIds) {
    const requested = Number(sessionMappings[String(semesterId)]);
    const session = sessions.find((candidate) => Number(candidate.id) === requested && Number(candidate.semesterId) === semesterId &&
      (candidate.batchId === undefined || !preview.selection?.batchId || Number(candidate.batchId) === Number(preview.selection.batchId)));
    if (!session) {
      checked.filter((row) => Number(row.semesterId) === semesterId).forEach((row) => {
        row.validationErrors.push(`Selected exam session does not belong to semester ${row.semesterNumber} in the selected batch.`);
        row.valid = false;
      });
      continue;
    }
    sessionBySemester.set(semesterId, session);
  }

  const duplicateGroups = new Map();
  let duplicateCount = 0;
  for (const row of checked) {
    const session = sessionBySemester.get(Number(row.semesterId));
    if (!session) continue;
    row.examSessionId = Number(session.id);
    row.examSessionName = session.sessionName;
    const key = `${row.usn}:${row.subjectCode}:${session.id}`;
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key).push(row);
    if (!row.studentId || !row.subjectId || typeof resultsModel.findExistingOriginalResult !== 'function') continue;
    const existing = await resultsModel.findExistingOriginalResult(row.studentId, row.subjectId, session.id);
    if (existing) {
      row.duplicateOriginal = true;
      row.validationErrors.push(`Original result already exists for ${row.usn}, subject ${row.subjectCode}, exam session "${session.sessionName}". Existing results are preserved.`);
      row.valid = false;
      duplicateCount += 1;
    }
  }
  for (const rows of duplicateGroups.values()) {
    if (rows.length < 2) continue;
    rows.forEach((row) => {
      row.validationErrors.push(`Duplicate original result entry for ${row.usn}, subject ${row.subjectCode}, exam session "${row.examSessionName}" appears in this upload.`);
      row.duplicateOriginal = true;
      row.valid = false;
      duplicateCount += 1;
    });
  }
  const validRecords = checked.filter((row) => row.valid);
  const invalidRecords = checked.filter((row) => !row.valid);
  preview.records = checked;
  return {
    records: checked, validRecords, invalidRecords,
    totalExtractedRecords: checked.length,
    validCount: validRecords.length,
    invalidCount: invalidRecords.length,
    duplicateCount
  };
}

async function revalidatePreviewSelection({ uploadToken, batchId, semesterId }, dependencies = {}) {
  const preview = pendingPreviews.get(String(uploadToken || ''));
  if (!preview) throw uploadError('This preview expired or the server restarted. Upload the document again.', 410);
  if (preview.ownerId && preview.ownerId !== dependencies.ownerId) throw uploadError('This preview belongs to another signed-in session.', 403);
  const selection = { batchId: Number(batchId), semesterId: Number(semesterId) };
  if (!Number.isSafeInteger(selection.batchId) || selection.batchId < 1 || !Number.isSafeInteger(selection.semesterId) || selection.semesterId < 1) {
    throw uploadError('Select a valid batch and semester to refresh validation.');
  }
  const validation = await validateRecords(preview.records, { model: dependencies.model || uploadModel, selection });
  preview.selection = selection;
  preview.records = validation.records;
  return { ...validation, uploadToken: preview.uploadToken, fileName: preview.fileName, format: preview.format };
}

async function confirmUpload({ uploadToken, sessionMappings }, dependencies = {}) {
  const token = String(uploadToken || '');
  const preview = pendingPreviews.get(token);
  if (!preview) throw uploadError('This preview expired or the server restarted. Upload the document again.', 410);
  if (preview.ownerId && preview.ownerId !== dependencies.ownerId) throw uploadError('This preview belongs to another signed-in session.', 403);
  if (preview.confirming) throw uploadError('This preview is already being confirmed.', 409);
  preview.confirming = true;
  try {
    if (!Array.isArray(preview.records) || preview.records.length === 0) throw uploadError('There are no extracted result rows to save.', 400);
    const invalidCount = preview.records.filter((record) => !record.valid).length;
    if (invalidCount) throw uploadError(`Confirmation blocked: ${invalidCount} invalid row(s) must be resolved by uploading a corrected document. No rows were saved.`, 422);
    if (!sessionMappings || typeof sessionMappings !== 'object' || Array.isArray(sessionMappings)) throw uploadError('Select an existing exam session for every semester in this upload.', 400);

    const model = dependencies.model || uploadModel;
    const reviewedRecords = preview.records.filter((record) => record.valid);
    const semesterIds = [...new Set(reviewedRecords.map((record) => record.semesterId))];
    const mappings = {};
    const sessions = await model.getExamSessions(semesterIds);
    for (const semesterId of semesterIds) {
      const sessionId = Number(sessionMappings[String(semesterId)]);
      const expectedBatchId = preview.selection?.batchId ?? reviewedRecords.find((record) => Number(record.semesterId) === semesterId)?.batchId;
      const session = sessions.find((candidate) => candidate.id === sessionId && candidate.semesterId === semesterId &&
        (candidate.batchId === undefined || expectedBatchId === undefined || Number(candidate.batchId) === Number(expectedBatchId)));
      if (!session) throw uploadError(`Choose a valid existing exam session for semester ${semesterId}.`, 400);
      mappings[semesterId] = sessionId;
    }

    const resultService = dependencies.resultService || require('./resultService');
    const recordsToSave = reviewedRecords.map((record) => ({
      usn: record.usn, subject_code: record.subjectCode, subject_name: record.subjectName,
      marks_obtained: record.total,
      max_marks: record.maxInternalMarks + record.maxExternalMarks,
      internal_marks: record.internalMarks, external_marks: record.externalMarks,
      max_internal_marks: record.maxInternalMarks, max_external_marks: record.maxExternalMarks,
      grade: record.computedGrade,
      status: record.resultStatus,
      exam_session_id: mappings[record.semesterId],
      exam_session_name: sessions.find((candidate) => candidate.id === mappings[record.semesterId])?.sessionName || ''
    }));
    const beforeInsert = async (connection) => {
      const latest = await validateRecords(preview.records, { model, selection: preview.selection || {}, executor: connection });
      const failures = latest.invalidRecords.flatMap((record) => record.validationErrors.map((message) => `${record.usn} ${record.subjectCode}: ${message}`));
      const previewByKey = new Map(preview.records.map((record) => [`${record.usn}:${record.subjectCode}`, record]));
      for (const record of latest.validRecords) {
        const oldRecord = previewByKey.get(`${record.usn}:${record.subjectCode}`);
        if (!oldRecord || Number(oldRecord.studentId) !== Number(record.studentId) || Number(oldRecord.subjectId) !== Number(record.subjectId) ||
            Number(oldRecord.maxInternalMarks) !== Number(record.maxInternalMarks) || Number(oldRecord.maxExternalMarks) !== Number(record.maxExternalMarks) ||
            Number(oldRecord.totalMaximumMarks) !== Number(record.totalMaximumMarks) || normalizedText(oldRecord.subjectName) !== normalizedText(record.subjectName)) {
          failures.push(`${record.usn} ${record.subjectCode}: student or subject configuration changed after preview. Review the upload again.`);
        }
        const sessionId = mappings[record.semesterId];
        const session = await model.findExamSessionForUpdate?.(sessionId, connection);
        const expectedBatchId = preview.selection?.batchId ?? record.batchId;
        if (!session || Number(session.semesterId) !== Number(record.semesterId) || Number(session.batchId) !== Number(expectedBatchId)) {
          failures.push(`${record.usn} ${record.subjectCode}: selected exam session no longer belongs to the selected batch and semester.`);
          continue;
        }
        const resultModel = dependencies.resultModel || require('../models/resultModel');
        if (record.studentId && record.subjectId && typeof resultModel.findExistingOriginalResult === 'function') {
          const existing = await resultModel.findExistingOriginalResult(record.studentId, record.subjectId, sessionId, connection);
          if (existing) failures.push(`Original result already exists for ${record.usn}, subject ${record.subjectCode}, exam session "${session.sessionName}". Nothing was saved.`);
        }
      }
      if (failures.length) throw uploadError(`Final confirmation validation failed: ${failures.join(' ')}`, 409);
    };
    const saved = await resultService.createResultsBatchService(recordsToSave, { beforeInsert });
    removePendingPreview(token);
    return { ...saved, fileName: preview.fileName };
  } catch (error) {
    if (pendingPreviews.get(token) === preview) preview.confirming = false;
    throw error;
  }
}

function cancelPreview(uploadToken, ownerId) {
  const token = String(uploadToken || '');
  const preview = pendingPreviews.get(token);
  if (!preview) return false;
  if (preview.ownerId && preview.ownerId !== ownerId) throw uploadError('This preview belongs to another signed-in session.', 403);
  if (preview.confirming) throw uploadError('This preview is currently being confirmed and cannot be cancelled.', 409);
  removePendingPreview(token);
  recentUploads.delete(preview.hash);
  return true;
}

module.exports = { previewUploadedFile, createReviewedPreview, validateRecords, getSessions, validatePreviewSession, revalidatePreviewSelection, confirmUpload, cancelPreview, asNumber, uploadError, recentUploads, pendingPreviews };
