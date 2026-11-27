'use strict';

const validationService = require('./resultValidationService');
const resultCalculationService = require('./resultCalculationService');
const resultExtractionModel = require('../models/resultExtractionModel');

function confirmationError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function flattenValidRecords(validation) {
  return validation.validRecords.flatMap((record) => record.subjects.map((subject) => {
    const internal = Number(subject.internalMarks);
    const external = Number(subject.externalMarks);
    const total = internal + external;
    const maxInternal = Number(subject.maxInternalMarks);
    const maxExternal = Number(subject.maxExternalMarks);
    const outcome = resultCalculationService.determineSubjectResult(internal, external, total);
    return {
      usn: record.student.usn,
      subject_code: subject.subjectCode,
      subject_name: subject.subjectName,
      marks_obtained: total,
      max_marks: maxInternal + maxExternal,
      internal_marks: internal,
      external_marks: external,
      max_internal_marks: maxInternal,
      max_external_marks: maxExternal,
      status: outcome.status,
      exam_session_id: validation.selection.examSessionId,
      semester_id: validation.selection.semesterId,
      exam_session_name: validation.context?.examSessionName || ''
    };
  }));
}

function referenceSnapshot(validation) {
  const entries = [];
  for (const record of validation.records) {
    for (const subject of record.subjects) {
      entries.push([`${record.student.usn}:${subject.subjectCode}`, {
      studentId: record.studentId,
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      maxInternalMarks: subject.maxInternalMarks,
      maxExternalMarks: subject.maxExternalMarks,
      totalMaximumMarks: subject.totalMaximumMarks
      }]);
    }
  }
  return new Map(entries);
}

async function confirmExtractedResults(payload = {}, dependencies = {}) {
  const validation = dependencies.validationService || validationService;
  const model = dependencies.model || resultExtractionModel;
  const selection = payload.selection || {};
  const students = payload.students;
  if (!Array.isArray(students) || !students.length) throw confirmationError('There are no valid result records to save.');
  const initial = await validation.validateExtraction(selection, students, { model });
  if (initial.invalidCount || !initial.validCount) {
    const details = initial.invalidRecords.flatMap((record) => [
      ...record.errors.map((error) => `${record.student.usn || 'Unknown USN'}: ${error}`),
      ...record.subjects.flatMap((subject) => subject.errors.map((error) => `${record.student.usn || 'Unknown USN'} ${subject.subjectCode || '(missing code)'}: ${error}`))
    ]);
    throw confirmationError(`Confirmation rejected. Correct all submitted records first. ${details.join(' ')}`, 422);
  }

  const records = flattenValidRecords(initial);
  if (!records.length) throw confirmationError('There are no valid subject result records to save.', 422);
  const initialReferences = referenceSnapshot(initial);
  const resultService = dependencies.resultService || require('./resultService');
  const beforeInsert = async (connection) => {
    const latest = await validation.validateExtraction(selection, students, { model, executor: connection });
    if (latest.invalidCount || !latest.validCount) {
      const details = latest.invalidRecords.flatMap((record) => [
        ...record.errors.map((error) => `${record.student.usn || 'Unknown USN'}: ${error}`),
        ...record.subjects.flatMap((subject) => subject.errors.map((error) => `${record.student.usn || 'Unknown USN'} ${subject.subjectCode || '(missing code)'}: ${error}`))
      ]);
      throw confirmationError(`Final confirmation validation failed. Nothing was saved. ${details.join(' ')}`, 409);
    }
    const currentReferences = referenceSnapshot(latest);
    const changed = [...initialReferences].some(([key, previous]) => {
      const current = currentReferences.get(key);
      return !current || Number(current.studentId) !== Number(previous.studentId) ||
        Number(current.subjectId) !== Number(previous.subjectId) ||
        current.subjectName !== previous.subjectName ||
        Number(current.maxInternalMarks) !== Number(previous.maxInternalMarks) ||
        Number(current.maxExternalMarks) !== Number(previous.maxExternalMarks) ||
        Number(current.totalMaximumMarks) !== Number(previous.totalMaximumMarks);
    }) || currentReferences.size !== initialReferences.size;
    if (changed) throw confirmationError('Student or subject configuration changed before saving. Review and validate the PDF again. Nothing was saved.', 409);
  };

  const saved = await resultService.createResultsBatchService(records, { beforeInsert });
  return {
    processedStudentCount: new Set(records.map((record) => record.usn.toUpperCase())).size,
    savedCount: saved.savedCount,
    failedRecordCount: 0,
    resultIds: saved.resultIds
  };
}

module.exports = { confirmExtractedResults, flattenValidRecords, referenceSnapshot, confirmationError };
