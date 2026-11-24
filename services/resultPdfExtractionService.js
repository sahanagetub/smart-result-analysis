'use strict';

const { PDFParse } = require('pdf-parse');
const resultExtractionModel = require('../models/resultExtractionModel');
const { parseVtuText } = require('./resultExtractionService');

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const USN_PATTERN = /^[1-4][A-Z]{2}\d{2}[A-Z]{2,4}\d{2,4}$/i;
const LABELLED_USN = /\b(?:USN|UNIVERSITY\s+SEAT\s+NUMBER)\s*[:#-]?\s*([A-Z0-9]{7,20})\b/i;

function extractionError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw extractionError(`Select a valid ${label}.`);
  return id;
}

function validatePdfFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) throw extractionError('Choose a non-empty PDF file.');
  if (file.buffer.length > MAX_FILE_BYTES) throw extractionError('PDF exceeds the 15 MB upload limit.', 413);
  const fileName = String(file.originalname || '').split(/[\\/]/).pop().toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (!fileName.endsWith('.pdf') || !['application/pdf', 'application/octet-stream'].includes(mime) ||
      !file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
    throw extractionError('File extension, MIME type or signature is invalid. Select a valid PDF file.');
  }
}

function readNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : String(value).trim();
}

function labelledDetails(pdfText) {
  const lines = String(pdfText || '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const labelledUsn = String(pdfText || '').match(LABELLED_USN);
  const usn = labelledUsn?.[1]?.toUpperCase() || String(pdfText || '').match(/\b[1-4][A-Z]{2}\d{2}[A-Z]{2,4}\d{2,4}\b/i)?.[0]?.toUpperCase() || '';
  const nameLine = lines.find((line) => /\b(?:STUDENT\s+NAME|CANDIDATE\s+NAME|NAME)\s*[:#-]/i.test(line));
  const studentName = nameLine ? nameLine.replace(/^.*?\b(?:STUDENT\s+NAME|CANDIDATE\s+NAME|NAME)\s*[:#-]\s*/i, '').trim() : '';
  return { usn, studentName };
}

function validateSubject(source, sourceIndex) {
  const subject = {
    subjectCode: String(source.subjectCode || '').trim().toUpperCase(),
    subjectName: String(source.subjectName || '').trim(),
    internalMarks: readNumber(source.internalMarks),
    externalMarks: readNumber(source.externalMarks),
    totalMarks: readNumber(source.total),
    result: source.resultStatus === 'Pass' || source.resultStatus === 'P' ? 'P' : source.resultStatus === 'Fail' || source.resultStatus === 'F' ? 'F' : '',
    sourceRow: source.sourceRow ?? sourceIndex + 1,
    errors: []
  };
  if (!/^[A-Z0-9]{4,20}$/.test(subject.subjectCode)) subject.errors.push('Subject code is missing or has an invalid format.');
  if (!subject.subjectName) subject.errors.push('Subject name is missing.');
  for (const [label, value] of [['Internal marks', subject.internalMarks], ['External marks', subject.externalMarks], ['Total marks', subject.totalMarks]]) {
    if (value === '') subject.errors.push(`${label} are missing.`);
    else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) subject.errors.push(`${label} are not a valid non-negative number.`);
  }
  if (typeof subject.internalMarks === 'number' && typeof subject.externalMarks === 'number' && typeof subject.totalMarks === 'number' &&
      Math.abs(subject.internalMarks + subject.externalMarks - subject.totalMarks) > 0.01) {
    subject.errors.push('Total marks do not equal internal plus external marks.');
  }
  if (!subject.result) subject.errors.push('Result status is missing or is not P/F.');
  return subject;
}

function groupRecords(records, pdfText) {
  const groups = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const usn = String(record.usn || '').trim().toUpperCase();
    const rowName = String(record.studentName || '').trim();
    const key = usn || `missing-usn:${rowName.toLocaleUpperCase('en') || index}`;
    if (!groups.has(key)) groups.set(key, { usn, name: '', semester: null, subjects: [], errors: [] });
    const group = groups.get(key);
    const name = rowName;
    if (name && !group.name) group.name = name;
    else if (name && group.name && name.toLocaleUpperCase('en') !== group.name.toLocaleUpperCase('en')) group.errors.push('Student name is inconsistent across extracted subject rows.');
    if (record.semesterNumber !== null && record.semesterNumber !== undefined && record.semesterNumber !== '' && Number.isInteger(Number(record.semesterNumber))) {
      group.semester = Number(record.semesterNumber);
    }
    group.subjects.push(validateSubject(record, index));
  }
  if (!groups.size) {
    const details = labelledDetails(pdfText);
    groups.set(details.usn || 'missing-usn', { usn: details.usn, name: details.studentName, semester: null, subjects: [], errors: [] });
  }
  return [...groups.values()].map((group) => {
    if (!group.usn) group.errors.push('Student USN was not found in the PDF.');
    else if (!USN_PATTERN.test(group.usn)) group.errors.push('Extracted student USN has an invalid format.');
    if (!group.name) group.errors.push('Student name was not found in the PDF.');
    if (!group.subjects.length) group.errors.push('No subject result rows could be extracted from the PDF.');
    group.subjects.forEach((subject) => subject.errors.forEach((message) => group.errors.push(`Subject row ${subject.sourceRow}: ${message}`)));
    return {
      student: { usn: group.usn, name: group.name },
      extractedSemester: group.semester,
      subjects: group.subjects,
      errors: group.errors
    };
  });
}

async function listBatches(dependencies = {}) {
  return (dependencies.model || resultExtractionModel).listBatches();
}

async function listSemesters(batchIdValue, dependencies = {}) {
  const batchId = positiveId(batchIdValue, 'batch');
  const model = dependencies.model || resultExtractionModel;
  const batches = await model.listBatches();
  if (!batches.some((batch) => Number(batch.id) === batchId)) throw extractionError('Selected batch was not found.', 404);
  return model.listSemesters(batchId);
}

async function listExamSessions(semesterIdValue, dependencies = {}) {
  const semesterId = positiveId(semesterIdValue, 'semester');
  const model = dependencies.model || resultExtractionModel;
  const semester = await model.getSemester(semesterId);
  if (!semester) throw extractionError('Selected semester was not found.', 404);
  return model.listExamSessions(semesterId);
}

async function extractPdf(file, selection = {}, dependencies = {}) {
  validatePdfFile(file);
  const batchId = positiveId(selection.batchId, 'batch');
  const semesterId = positiveId(selection.semesterId, 'semester');
  const examSessionId = positiveId(selection.examSessionId, 'exam session');
  const model = dependencies.model || resultExtractionModel;
  const context = await model.getSelectionContext(batchId, semesterId, examSessionId);
  if (!context) throw extractionError('The selected batch, semester and exam session do not belong together.', 400);

  let parser;
  try {
    parser = new PDFParse({ data: file.buffer });
    const extracted = await parser.getText({ first: MAX_PDF_PAGES, lineEnforce: true, cellSeparator: ' ', pageJoiner: '\n' });
    if (extracted.total > MAX_PDF_PAGES) throw extractionError('PDF exceeds the 100-page extraction limit.', 413);
    let pdfText = String(extracted.text || '');
    if (!pdfText.trim()) throw extractionError('The PDF contains no selectable text. Scanned PDFs are not supported in this phase.', 422);
    const records = parseVtuText(pdfText, dependencies.parsingRules);
    const students = groupRecords(records, pdfText);
    students.forEach((item) => { item.warnings = []; });
    for (const item of students) {
      if (item.extractedSemester !== null && item.extractedSemester !== Number(context.semesterNumber)) {
        item.errors.push(`PDF semester ${item.extractedSemester} differs from selected semester ${context.semesterNumber}.`);
      }
    }
    const allSubjects = students.flatMap((item) => item.subjects.map((subject) => ({ ...subject, usn: item.student.usn, studentName: item.student.name })));
    const errors = students.flatMap((item) => item.errors.map((message) => `${item.student.usn || 'Unknown student'}: ${message}`));
    return {
      selection: {
        batch: { id: Number(context.batchId), name: context.batchName },
        semester: { id: Number(context.semesterId), number: Number(context.semesterNumber), name: context.semesterName },
        examSession: { id: Number(context.examSessionId), name: context.examSessionName }
      },
      student: students.length === 1 ? students[0].student : null,
      semester: Number(context.semesterNumber),
      subjects: allSubjects,
      students,
      extractionMethod: 'text',
      totalSubjectsExtracted: allSubjects.length,
      extractionErrors: errors,
      fileName: String(file.originalname || 'result.pdf').split(/[\\/]/).pop()
    };
  } catch (error) {
    if (error.status) throw error;
    throw extractionError('The PDF is corrupted, encrypted or unsupported. Choose a readable text-based PDF.', 400);
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
}

module.exports = { extractPdf, listBatches, listSemesters, listExamSessions, validatePdfFile, groupRecords, positiveId, extractionError };
