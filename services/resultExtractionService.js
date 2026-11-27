'use strict';

const XLSX = require('xlsx');
const { PDFParse } = require('pdf-parse');
const { DEFAULT_RESULT_PDF_RULES } = require('../config/resultPdfParsingRules');

const VTU_USN = /\b[1-4][A-Z]{2}\d{2}[A-Z]{2,4}\d{2,4}\b/i;
const LABELLED_USN = /\b(?:USN|UNIVERSITY\s+SEAT\s+NUMBER)\s*[:#-]?\s*((?=[A-Z0-9]{7,20}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{7,20})\b/i;
const MARK_TOKEN = /(?:\b(?:AB|NE|NA)\b|--|-|\b\d+(?:\.\d+)?\b)/gi;
const ROMAN_SEMESTERS = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function parseSemester(value) {
  const source = text(value).toUpperCase();
  const direct = source.match(/\b(?:SEM(?:ESTER)?\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*)(XII|XI|VIII|VII|VI|V|IV|III|II|I|X|\d{1,2})\b/);
  const ordinal = source.match(/\b(\d{1,2})(?:ST|ND|RD|TH)?\s+SEMESTER\b/);
  const token = direct?.[1] || ordinal?.[1];
  if (!token) return null;
  const valueNumber = /^\d+$/.test(token) ? Number(token) : ROMAN_SEMESTERS[token];
  return Number.isInteger(valueNumber) && valueNumber >= 1 && valueNumber <= 12 ? valueNumber : null;
}

function cleanStudentName(value) {
  return text(value).replace(/^(?:STUDENT\s+)?NAME\s*[:#-]?\s*/i, '').replace(/\s+(?:SEMESTER|SEM\.?|USN)\b.*$/i, '').trim();
}

function updateMetadata(line, current, rules = DEFAULT_RESULT_PDF_RULES) {
  const value = text(line);
  const labelledUsn = value.match(LABELLED_USN);
  const plainUsn = value.match(new RegExp(rules.usnPattern || DEFAULT_RESULT_PDF_RULES.usnPattern, 'i'));
  const usnMatch = labelledUsn || plainUsn;
  if (usnMatch) {
    const nextUsn = (labelledUsn ? labelledUsn[1] : plainUsn[0]).toUpperCase();
    if (current.usn !== nextUsn) {
      current.usn = nextUsn;
      current.studentName = '';
    }
    const matchedUsn = labelledUsn || plainUsn;
    if (matchedUsn) {
      const afterUsn = value.slice(matchedUsn.index + matchedUsn[0].length)
        .replace(/^[\s,:;|\-]+/, '').replace(/^STUDENT\s+NAME\s*[:#-]?\s*/i, '');
      if (afterUsn && !/^(?:SEMESTER|SEM\.?|SUBJECT|RESULT|MARKS?)\b/i.test(afterUsn)) {
        current.studentName = cleanStudentName(afterUsn);
      }
    }
  }
  const nameMatch = value.match(/\b(?:STUDENT\s+NAME|CANDIDATE\s+NAME|NAME)\s*[:#-]\s*(.+)$/i);
  if (nameMatch) current.studentName = cleanStudentName(nameMatch[1]);
  else {
    const plainName = value.match(/^\s*(?:STUDENT\s+NAME|CANDIDATE\s+NAME|NAME)\s+(.+)$/i);
    if (plainName && !/\b(?:USN|SEMESTER|SUBJECT\s+CODE|INTERNAL\s+MARKS|EXTERNAL\s+MARKS|RESULT|TOTAL\s+MARKS)\b/i.test(plainName[1])) {
      current.studentName = cleanStudentName(plainName[1]);
    }
  }
  const semester = parseSemester(value);
  if (semester !== null) current.semesterNumber = semester;
  return current;
}

function parseSubjectLine(line, metadata, source = {}, rules = DEFAULT_RESULT_PDF_RULES) {
  const clean = text(line);
  if (!clean || /\b(?:USN|UNIVERSITY\s+SEAT\s+NUMBER|STUDENT\s+NAME|CANDIDATE\s+NAME|SEMESTER|SUBJECT\s+CODE|INTERNAL\s+MARKS|EXTERNAL\s+MARKS|TOTAL\s+MARKS)\b/i.test(clean)) return null;
  // VTU cards often put the announced date after P/F, so remove dates before
  // locating the three mark columns and recognize status anywhere in the row.
  const withoutDates = clean.replace(/\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g, ' ');
  const statusMatches = [...withoutDates.matchAll(/\b(PASS|FAIL|P|F)\b/gi)];
  const statusMatch = statusMatches.at(-1) || null;
  const body = statusMatch
    ? `${withoutDates.slice(0, statusMatch.index)} ${withoutDates.slice(statusMatch.index + statusMatch[0].length)}`.trim()
    : withoutDates;
  const markMatches = [...body.matchAll(new RegExp(rules.markPattern || DEFAULT_RESULT_PDF_RULES.markPattern, 'gi'))];
  const markFields = markMatches.slice(-3);
  const beforeMarks = markFields.length ? body.slice(0, markFields[0].index).trim() : body;
  const codeMatch = beforeMarks.match(new RegExp(rules.subjectCodePattern || DEFAULT_RESULT_PDF_RULES.subjectCodePattern, 'i'));
  if (!codeMatch) return null;
  const subjectName = text(beforeMarks.slice(codeMatch.index + codeMatch[0].length).replace(/^[\s:|.-]+/, ''));
  if (/\b(?:SUBJECT\s+NAME|INTERNAL|EXTERNAL|TOTAL)\b/i.test(subjectName)) return null;
  return {
    usn: metadata.usn || '', studentName: metadata.studentName || '',
    semesterNumber: metadata.semesterNumber ?? null,
    subjectCode: codeMatch[0].toUpperCase(), subjectName,
    // A partially visible row is kept as an invalid row; never shift the
    // remaining numeric values into guessed mark columns.
    internalMarks: markMatches.length === 3 ? markMatches[0][0] : '',
    externalMarks: markMatches.length === 3 ? markMatches[1][0] : '',
    total: markMatches.length === 3 ? markMatches[2][0] : '',
    resultStatus: statusMatch ? (['PASS', 'P'].includes(statusMatch[1].toUpperCase()) ? 'Pass' : 'Fail') : '',
    ...source
  };
}

function lineLooksLikeSubjectStart(line, rules = DEFAULT_RESULT_PDF_RULES) {
  const value = text(line);
  if (/\b(?:USN|STUDENT\s+NAME|SEMESTER|SUBJECT\s+CODE|INTERNAL\s+MARKS)\b/i.test(value)) return false;
  return new RegExp(rules.subjectCodePattern || DEFAULT_RESULT_PDF_RULES.subjectCodePattern, 'i').test(value);
}

function parseVtuText(documentText, rules = DEFAULT_RESULT_PDF_RULES) {
  rules = { ...DEFAULT_RESULT_PDF_RULES, ...(rules || {}) };
  const lines = String(documentText || '').split(/\r?\n/).map(text).filter(Boolean);
  const metadata = { usn: '', studentName: '', semesterNumber: null };
  const records = [];
  let pending = '';
  let pendingLine = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const incomingUsn = line.match(LABELLED_USN)?.[1] || line.match(new RegExp(rules.usnPattern, 'i'))?.[0] || '';
    if (pending && incomingUsn && metadata.usn && incomingUsn.toUpperCase() !== metadata.usn) {
      const incomplete = parseSubjectLine(pending, metadata, { sourceRow: pendingLine ?? index + 1 }, rules);
      if (incomplete) records.push(incomplete);
      pending = ''; pendingLine = null;
    }
    const previousUsn = metadata.usn;
    updateMetadata(line, metadata, rules);
    if (metadata.usn && metadata.usn !== previousUsn) { pending = ''; pendingLine = null; }
    if (pending && lineLooksLikeSubjectStart(line, rules)) {
      const incomplete = parseSubjectLine(pending, metadata, { sourceRow: pendingLine ?? index + 1 }, rules);
      if (incomplete) records.push(incomplete);
      pending = line;
      pendingLine = index + 1;
      continue;
    }
    let candidate = pending ? `${pending} ${line}` : line;
    const record = parseSubjectLine(candidate, metadata, { sourceRow: pendingLine ?? index + 1 }, rules);
    const hasCompleteMarks = record && record.internalMarks !== '' && record.externalMarks !== '' && record.total !== '';
    if (hasCompleteMarks) {
      records.push(record);
      pending = ''; pendingLine = null;
      continue;
    }
    if (record && !pending) {
      pending = line;
      pendingLine = index + 1;
      continue;
    }
    if (!pending && lineLooksLikeSubjectStart(line, rules)) {
      pending = line;
      pendingLine = index + 1;
    } else if (pending) {
      pending = `${pending} ${line}`;
      if (pending.length > 400) { pending = ''; pendingLine = null; }
    }
  }
  if (pending) {
    const incomplete = parseSubjectLine(pending, metadata, { sourceRow: pendingLine ?? lines.length }, rules);
    if (incomplete) records.push(incomplete);
  }
  return records;
}

function normalizeHeader(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findColumn(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (let index = 0; index < normalized.length; index += 1) {
    if (aliases.includes(normalized[index])) return index;
  }
  return -1;
}

function detectHeader(row) {
  const headers = row.map(text);
  const columns = {
    usn: findColumn(headers, ['usn', 'university seat number']),
    studentName: findColumn(headers, ['student name', 'candidate name', 'name']),
    semester: findColumn(headers, ['semester', 'semester number', 'sem']),
    subjectCode: findColumn(headers, ['subject code', 'subjectcode', 'course code', 'paper code', 'code']),
    subjectName: findColumn(headers, ['subject name', 'subjectname', 'course name', 'paper name', 'subject']),
    internal: findColumn(headers, ['internal marks', 'internal mark', 'internal', 'ia marks', 'ia']),
    external: findColumn(headers, ['external marks', 'external mark', 'external', 'see marks', 'see']),
    total: findColumn(headers, ['total marks', 'total mark', 'total']),
    status: findColumn(headers, ['result status', 'result', 'status'])
  };
  return ['subjectCode', 'subjectName', 'internal', 'external', 'total', 'status'].every((field) => columns[field] >= 0) ? columns : null;
}

function updateMetadataFromCells(row, metadata) {
  const labelFields = {
    usn: new Set(['usn', 'university seat number']),
    studentName: new Set(['student name', 'candidate name', 'name']),
    semesterNumber: new Set(['semester', 'semester number', 'sem'])
  };
  const isMetadataLabel = (value) => Object.values(labelFields).some((labels) => labels.has(normalizeHeader(value)));
  for (let index = 0; index < row.length - 1; index += 1) {
    const label = normalizeHeader(row[index]);
    const next = text(row[index + 1]);
    if (!next || isMetadataLabel(next)) continue;
    if (labelFields.usn.has(label)) {
      const match = next.match(LABELLED_USN)?.[1] || next.match(VTU_USN)?.[0];
      if (match) metadata.usn = match.toUpperCase();
    } else if (labelFields.studentName.has(label)) metadata.studentName = cleanStudentName(next);
    else if (labelFields.semesterNumber.has(label)) metadata.semesterNumber = parseSemester(next) ?? (Number(next) || null);
  }
}

function fromExcelRow(row, columns, metadata, sheetName, sourceRow) {
  const current = { ...metadata };
  const cell = (field) => columns[field] >= 0 ? text(row[columns[field]]) : '';
  const rowUsn = cell('usn');
  const rowName = cell('studentName');
  const rowSemester = cell('semester');
  if (rowUsn) current.usn = rowUsn.toUpperCase();
  if (rowName) current.studentName = cleanStudentName(rowName);
  if (rowSemester) current.semesterNumber = parseSemester(rowSemester) ?? (Number(rowSemester) || null);
  const subjectCode = cell('subjectCode');
  const subjectName = cell('subjectName');
  if (!subjectCode && !subjectName) return null;
  return {
    usn: current.usn || '', studentName: current.studentName || '', semesterNumber: current.semesterNumber ?? null,
    subjectCode: subjectCode.toUpperCase(), subjectName,
    internalMarks: columns.internal >= 0 ? text(row[columns.internal]) : '',
    externalMarks: columns.external >= 0 ? text(row[columns.external]) : '',
    total: columns.total >= 0 ? text(row[columns.total]) : '',
    resultStatus: cell('status'), sourceSheet: sheetName, sourceRow
  };
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false, sheetRows: 10001 });
  if (!workbook.SheetNames.length || workbook.SheetNames.length > 10) throw new Error('The Excel workbook has no readable sheets or contains too many sheets.');
  const records = [];
  let processedRows = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
    processedRows += rows.length;
    if (processedRows > 20000) throw new Error('The Excel workbook exceeds the 20,000 row processing limit.');
    let columns = null;
    const metadata = { usn: '', studentName: '', semesterNumber: null };
    const sheetRecords = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index].map((value) => value instanceof Date ? value.toISOString() : text(value));
      const joined = row.join(' ');
      const previousUsn = metadata.usn;
      const detected = detectHeader(row);
      if (detected) { columns = detected; continue; }
      const isHeaderLabelsOnly = row.length > 1 && row.every((value) => !value || /^(?:USN|UNIVERSITY SEAT NUMBER|STUDENT NAME|CANDIDATE NAME|NAME|SEMESTER|SEMESTER NUMBER|SEM)$/i.test(value));
      if (!isHeaderLabelsOnly) {
        updateMetadata(joined, metadata);
        updateMetadataFromCells(row, metadata);
      }
      if (columns) {
        const record = fromExcelRow(row, columns, metadata, sheetName, index + 1);
        if (record) sheetRecords.push(record);
      }
      if (previousUsn !== metadata.usn) metadata.studentName = metadata.studentName || '';
    }
    if (sheetRecords.length) records.push(...sheetRecords);
    else {
      const textLines = rows.map((row) => row.map(text).filter(Boolean).join(' '));
      records.push(...parseVtuText(textLines.join('\n')).map((record) => ({ ...record, sourceSheet: sheetName })));
    }
  }
  return records;
}

function getExtension(fileName) {
  const base = String(fileName || '').split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot).toLowerCase();
}

function hasZipEndOfCentralDirectory(buffer) {
  const minimum = 22;
  const start = Math.max(0, buffer.length - 65557);
  for (let index = buffer.length - minimum; index >= start; index -= 1) {
    if (buffer[index] === 0x50 && buffer[index + 1] === 0x4b && buffer[index + 2] === 0x05 && buffer[index + 3] === 0x06) return true;
  }
  return false;
}

function getZipUncompressedSize(buffer) {
  const minimum = 22;
  const start = Math.max(0, buffer.length - 65557);
  let endRecord = -1;
  for (let index = buffer.length - minimum; index >= start; index -= 1) {
    if (buffer[index] === 0x50 && buffer[index + 1] === 0x4b && buffer[index + 2] === 0x05 && buffer[index + 3] === 0x06) {
      endRecord = index;
      break;
    }
  }
  if (endRecord < 0) return null;
  const commentLength = buffer.readUInt16LE(endRecord + 20);
  if (endRecord + minimum + commentLength > buffer.length) return null;
  const entries = buffer.readUInt16LE(endRecord + 10);
  const directorySize = buffer.readUInt32LE(endRecord + 12);
  let offset = buffer.readUInt32LE(endRecord + 16);
  if (entries === 0xffff || directorySize === 0xffffffff || offset === 0xffffffff || entries > 2000 || offset + directorySize > endRecord) return null;
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    if (uncompressedSize === 0xffffffff) return null;
    total += uncompressedSize;
    if (total > 64 * 1024 * 1024) return Infinity;
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return offset <= endRecord ? total : null;
}

function hasLegacyExcelWorkbook(buffer) {
  try {
    const compoundFile = XLSX.CFB.read(buffer, { type: 'buffer' });
    return (compoundFile.FileIndex || []).some((entry) => entry.name === 'Workbook' || entry.name === 'Book');
  } catch (_) { return false; }
}

function validateFileEnvelope(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) throw Object.assign(new Error('Choose a non-empty result file.'), { status: 400 });
  if (file.buffer.length > 15 * 1024 * 1024) throw Object.assign(new Error('File exceeds the 15 MB upload limit.'), { status: 413 });
  const ext = getExtension(file.originalname);
  const mime = String(file.mimetype || '').toLowerCase();
  const buffer = file.buffer;
  const isPdf = ext === '.pdf' && (mime === 'application/pdf' || mime === 'application/octet-stream') && buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
  const isXlsx = ext === '.xlsx' && (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mime === 'application/octet-stream') &&
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && hasZipEndOfCentralDirectory(buffer);
  const isXls = ext === '.xls' && (mime === 'application/vnd.ms-excel' || mime === 'application/octet-stream') &&
    buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) && hasLegacyExcelWorkbook(buffer);
  if (!(isPdf || isXlsx || isXls)) throw Object.assign(new Error('File extension, MIME type or file signature is not supported. Use a valid PDF, XLS or XLSX VTU result file.'), { status: 400 });
  if (isXlsx) {
    const expandedSize = getZipUncompressedSize(buffer);
    if (expandedSize === null) throw Object.assign(new Error('The XLSX ZIP directory is malformed or uses unsupported ZIP64 entries.'), { status: 400 });
    if (expandedSize === Infinity || expandedSize > 64 * 1024 * 1024) throw Object.assign(new Error('The XLSX expands beyond the 64 MB processing limit.'), { status: 413 });
  }
  return isPdf ? 'pdf' : 'excel';
}

async function extractUploadedDocument(file) {
  const format = validateFileEnvelope(file);
  if (format === 'excel') {
    try { return { format, records: parseWorkbook(file.buffer) }; }
    catch (error) { throw Object.assign(new Error('The Excel file is corrupted or is not a readable XLS/XLSX workbook.'), { status: 400 }); }
  }
  const pdfText = await extractSelectablePdfText(file.buffer);
  return { format, records: parseVtuText(pdfText) };
}

/** Extract embedded PDF text only. This deliberately has no OCR/image fallback. */
async function extractSelectablePdfText(buffer, options = {}) {
  const maxPages = Number.isInteger(options.maxPages) && options.maxPages > 0 ? options.maxPages : 100;
  const pageLimitMessage = options.pageLimitMessage || `PDF exceeds the ${maxPages}-page extraction limit.`;
  const unreadableMessage = options.unreadableMessage || 'The PDF could not be read. Check that it is a valid, unencrypted PDF with selectable text.';
  const noTextMessage = options.noTextMessage || 'The PDF contains no selectable text. Scanned PDFs are not supported; OCR is not enabled.';
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw Object.assign(new Error('Choose a non-empty PDF file.'), { status: 400 });

  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const extracted = await parser.getText({
      first: maxPages,
      lineEnforce: true,
      cellSeparator: ' ',
      pageJoiner: '\n'
    });
    const pageCount = Number(extracted?.total);
    if (Number.isFinite(pageCount) && pageCount > maxPages) {
      throw Object.assign(new Error(pageLimitMessage), { status: 413 });
    }
    const pdfText = String(extracted?.text || '').replace(/\u0000/g, '').trim();
    if (!pdfText) throw Object.assign(new Error(noTextMessage), { status: 422 });
    return pdfText;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error(unreadableMessage), { status: 400 });
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
}

module.exports = {
  extractUploadedDocument, parseWorkbook, parseVtuText, detectHeader,
  extractSelectablePdfText, validateFileEnvelope, getExtension, parseSemester,
  hasZipEndOfCentralDirectory, hasLegacyExcelWorkbook, getZipUncompressedSize
};
