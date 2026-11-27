'use strict';

const resultExtractionModel = require('../models/resultExtractionModel');

function validationError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw validationError(`Select a valid ${label}.`);
  return id;
}

function numberValue(value) {
  if (value === null || value === undefined || String(value).trim() === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeUsn(value) { return String(value || '').trim().toUpperCase(); }
function normalizeCode(value) { return String(value || '').trim().toUpperCase(); }

function validateMarks(subject, configuredSubject, errors) {
  const marks = [subject.internalMarks, subject.externalMarks, subject.totalMarks].map(numberValue);
  const checks = [
    ['Internal marks', subject.internalMarks, configuredSubject?.maxInternalMarks],
    ['External marks', subject.externalMarks, configuredSubject?.maxExternalMarks],
    ['Total marks', subject.totalMarks, configuredSubject?.totalMaximumMarks]
  ];
  for (const [label, value, maximum] of checks) {
    const numeric = numberValue(value);
    if (numeric === null) errors.push(`${label} must be numeric.`);
    else if (numeric < 0) errors.push(`${label} cannot be negative.`);
    else if (maximum !== undefined && maximum !== null && numeric > Number(maximum)) errors.push(`${label} exceeds the configured maximum of ${maximum}.`);
  }
  if (marks.every((value) => value !== null) && Math.abs(marks[0] + marks[1] - marks[2]) > 0.01) {
    errors.push('Total marks do not equal internal plus external marks.');
  }
}

async function validateExtraction(selection = {}, students = [], dependencies = {}) {
  const batchId = positiveId(selection.batchId, 'batch');
  const semesterId = positiveId(selection.semesterId, 'semester');
  const examSessionId = positiveId(selection.examSessionId, 'exam session');
  if (!Array.isArray(students) || !students.length) throw validationError('There are no extracted student records to validate.');
  if (students.length > 5000) throw validationError('At most 5,000 extracted students can be validated at once.', 413);

  const model = dependencies.model || resultExtractionModel;
  const context = await model.getSelectionContext(batchId, semesterId, examSessionId, dependencies.executor || null);
  if (!context) throw validationError('The selected batch, semester and exam session do not belong together.');
  const usns = students.map((source) => source?.student?.usn).filter(Boolean);
  const references = await model.getValidationReferenceData(batchId, semesterId, usns, dependencies.executor || null);
  if (!references) throw validationError('Database reference checks are unavailable. Enable MySQL before validating.', 503);
  const studentMap = new Map((references.students || []).map((student) => [normalizeUsn(student.usn), student]));
  const subjectMap = new Map((references.subjects || []).map((subject) => [normalizeCode(subject.subjectCode || subject.subject_code), subject]));
  const existingResultMap = new Map((references.existingResults || []).map((result) => [
    `${normalizeUsn(result.usn)}|${normalizeCode(result.subjectCode || result.subject_code)}`, result
  ]));

  const records = students.map((source) => {
    const student = source?.student || {};
    const usn = normalizeUsn(student.usn);
    const errors = [];
    const warnings = [];
    const existingStudent = studentMap.get(usn);
    if (!usn) errors.push('Student USN is missing.');
    else if (!existingStudent) errors.push(`Unknown USN: ${usn}.`);
    else if (Number(existingStudent.batchId ?? existingStudent.batch_id) !== batchId) errors.push(`USN ${usn} belongs to another batch.`);
    const studentName = String(student.name || '').trim();
    if (!studentName) errors.push('Student name is missing.');
    else if (existingStudent?.name && normalizeCode(studentName) !== normalizeCode(existingStudent.name)) errors.push(`Student name does not match the record for USN ${usn}.`);
    const rawSemester = source.extractedSemester;
    const extractedSemester = rawSemester === null || rawSemester === undefined || String(rawSemester).trim() === '' ? null : Number(rawSemester);
    if (!Number.isInteger(extractedSemester)) errors.push('Uploaded semester was not found in the extracted record.');
    else if (extractedSemester !== Number(context.semesterNumber)) errors.push(`Uploaded semester ${extractedSemester} does not match selected semester ${context.semesterNumber}.`);

    const sourceSubjects = Array.isArray(source.subjects) ? source.subjects : [];
    const subjectCodeCounts = new Map();
    sourceSubjects.forEach((subject) => {
      const code = normalizeCode(subject.subjectCode);
      if (code) subjectCodeCounts.set(code, (subjectCodeCounts.get(code) || 0) + 1);
    });
    const subjects = sourceSubjects.map((sourceSubject) => {
      const subjectCode = normalizeCode(sourceSubject.subjectCode);
      const subjectErrors = [];
      const configuredSubject = subjectMap.get(subjectCode);
      const existingResult = usn && subjectCode ? existingResultMap.get(`${usn}|${subjectCode}`) : null;
      const subjectName = String(sourceSubject.subjectName || '').trim();
      if (!subjectCode) subjectErrors.push('Subject code is missing.');
      if (subjectCode && subjectCodeCounts.get(subjectCode) > 1) subjectErrors.push(`Duplicate subject code: ${subjectCode}.`);
      if (subjectCode && !configuredSubject) subjectErrors.push(`Unknown subject code: ${subjectCode}.`);
      if (existingResult) {
        const session = existingResult.sessionName || `session ${existingResult.examSessionId}`;
        subjectErrors.push(`A result for ${subjectCode} is already saved for ${usn} in this semester (${session}). It cannot be saved again.`);
      }
      if (!subjectName) subjectErrors.push(`Subject name is missing for ${subjectCode || 'this subject'}.`);
      else if (configuredSubject && normalizeCode(subjectName) !== normalizeCode(configuredSubject.subjectName || configuredSubject.subject_name)) {
        subjectErrors.push(`Subject name does not match configured subject ${subjectCode}.`);
      }
      validateMarks(sourceSubject, configuredSubject, subjectErrors);
      if (!['P', 'F'].includes(String(sourceSubject.result || '').trim().toUpperCase())) subjectErrors.push('Result status is missing or must be P/F.');
      return {
        subjectId: configuredSubject ? Number(configuredSubject.id ?? configuredSubject.subjectId) : null,
        subjectCode, subjectName,
        maxInternalMarks: configuredSubject ? Number(configuredSubject.maxInternalMarks ?? configuredSubject.max_internal_marks) : null,
        maxExternalMarks: configuredSubject ? Number(configuredSubject.maxExternalMarks ?? configuredSubject.max_external_marks) : null,
        totalMaximumMarks: configuredSubject ? Number(configuredSubject.totalMaximumMarks ?? configuredSubject.total_maximum_marks) : null,
        internalMarks: sourceSubject.internalMarks, externalMarks: sourceSubject.externalMarks,
        totalMarks: sourceSubject.totalMarks, result: sourceSubject.result, errors: subjectErrors, valid: subjectErrors.length === 0
      };
    });
    if (!subjects.length) errors.push('No subject results were extracted for this student.');
    const extractedCodes = new Set(subjects.map((subject) => subject.subjectCode));
    const missingSubjects = [...subjectMap.keys()].filter((code) => !extractedCodes.has(code));
    if (missingSubjects.length) warnings.push(`Configured subject codes not found in this extraction: ${missingSubjects.join(', ')}.`);
    if (subjects.some((subject) => !subject.valid)) errors.push('One or more subject results are invalid.');
    return {
      studentId: existingStudent ? Number(existingStudent.id ?? existingStudent.studentId) : null,
      student: { usn, name: studentName }, extractedSemester: Number.isInteger(extractedSemester) ? extractedSemester : null,
      subjects, errors, warnings, valid: errors.length === 0
    };
  });
  const validRecords = records.filter((record) => record.valid);
  const invalidRecords = records.filter((record) => !record.valid);
  return { selection: { batchId, semesterId, examSessionId }, context, records, validRecords, invalidRecords, totalCount: records.length, validCount: validRecords.length, invalidCount: invalidRecords.length };
}

module.exports = { validateExtraction, validationError, numberValue };
