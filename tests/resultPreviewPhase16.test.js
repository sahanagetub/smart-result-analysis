'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const extraction = require('../services/resultPdfExtractionService');
const validation = require('../services/resultValidationService');

function makePdf(lines) {
  const commands = ['BT', '/F1 10 Tf', '50 760 Td'];
  lines.forEach((line, index) => {
    if (index) commands.push('0 -14 Td');
    commands.push(`(${line.replace(/([\\()])/g, '\\$1')}) Tj`);
  });
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}

const selection = { batchId: 2, semesterId: 12, examSessionId: 23 };
const refs = {
  students: [
    { usn: '1MV25MC052', name: 'SAMPLE STUDENT', batchId: 2 },
    { usn: '1MV25MC053', name: 'SECOND STUDENT', batchId: 2 }
  ],
  subjects: [
    { subjectCode: 'MMC101', subjectName: 'PROGRAMMING IN C', maxInternalMarks: 50, maxExternalMarks: 50, totalMaximumMarks: 100 },
    { subjectCode: 'MMC102', subjectName: 'DATABASE SYSTEMS', maxInternalMarks: 50, maxExternalMarks: 50, totalMaximumMarks: 100 }
  ]
};
const model = {
  getSelectionContext: async () => ({
    batchId: 2, batchName: 'MCA 2025-2027', semesterId: 12, semesterNumber: 1,
    semesterName: 'Semester 1', examSessionId: 23, examSessionName: '2026 Regular'
  }),
  getValidationReferenceData: async () => refs
};

test('Phase 16 extraction preview groups multiple students and subject rows without saving', async () => {
  const pdf = makePdf([
    'USN: 1MV25MC052', 'Student Name: SAMPLE STUDENT', 'Semester: 1',
    'MMC101 PROGRAMMING IN C 50 41 91 P', 'MMC102 DATABASE SYSTEMS 49 47 96 P',
    'USN: 1MV25MC053', 'Student Name: SECOND STUDENT', 'Semester: 1',
    'MMC101 PROGRAMMING IN C 45 40 85 P'
  ]);
  const preview = await extraction.extractPdf({ originalname: 'multi.pdf', mimetype: 'application/pdf', buffer: pdf }, selection, { model });
  assert.equal(preview.students.length, 2);
  assert.equal(preview.students[0].student.usn, '1MV25MC052');
  assert.equal(preview.students[0].subjects.length, 2);
  assert.equal(preview.students[0].subjects[0].internalMarks, 50);
  assert.equal(preview.students[1].subjects[0].subjectCode, 'MMC101');
  assert.equal(preview.selection.batch.name, 'MCA 2025-2027');
  assert.equal(Object.hasOwn(preview, 'reviewToken'), false);
});

test('preview validation separates invalid marks and warns for partial subject groups', async () => {
  const students = [
    {
      student: { usn: '1MV25MC052', name: 'SAMPLE STUDENT' }, extractedSemester: 1,
      subjects: [
        { subjectCode: 'MMC101', subjectName: 'PROGRAMMING IN C', internalMarks: 51, externalMarks: 41, totalMarks: 92, result: 'P' }
      ]
    },
    {
      student: { usn: '1MV25MC053', name: 'SECOND STUDENT' }, extractedSemester: 1,
      subjects: [
        { subjectCode: 'MMC101', subjectName: 'PROGRAMMING IN C', internalMarks: 45, externalMarks: 40, totalMarks: 85, result: 'P' },
        { subjectCode: 'MMC102', subjectName: 'DATABASE SYSTEMS', internalMarks: 45, externalMarks: 42, totalMarks: 87, result: 'P' }
      ]
    }
  ];
  const result = await validation.validateExtraction(selection, students, { model });
  assert.equal(result.validCount, 1);
  assert.equal(result.invalidCount, 1);
  assert.match(result.invalidRecords[0].subjects[0].errors.join(' '), /Internal marks exceeds the configured maximum of 50/);
  assert.match(result.invalidRecords[0].warnings.join(' '), /MMC102/);
});

test('preview validation checks missing and conflicting student or subject information', async () => {
  const result = await validation.validateExtraction(selection, [{
    student: { usn: '', name: '' }, extractedSemester: 5,
    subjects: [
      { subjectCode: '', subjectName: '', internalMarks: '', externalMarks: 'x', totalMarks: -1, result: '' },
      { subjectCode: 'MMC999', subjectName: 'Different', internalMarks: 1, externalMarks: 1, totalMarks: 2, result: 'P' },
      { subjectCode: 'MMC999', subjectName: 'Different', internalMarks: 1, externalMarks: 1, totalMarks: 2, result: 'P' },
      { subjectCode: 'MMC101', subjectName: 'PROGRAMMING IN C', internalMarks: '', externalMarks: 'x', totalMarks: -1, result: 'P' }
    ]
  }], { model });
  const messages = [...result.invalidRecords[0].errors, ...result.invalidRecords[0].subjects.flatMap((subject) => subject.errors)].join(' ');
  assert.match(messages, /Student USN is missing/);
  assert.match(messages, /Student name is missing/);
  assert.match(messages, /does not match selected semester/);
  assert.match(messages, /Subject code is missing/);
  assert.match(messages, /Duplicate subject code/);
  assert.match(messages, /must be numeric|cannot be negative/);
});

test('Phase 16 preview interface supports editing, separate validation groups and no save request', () => {
  const html = fs.readFileSync(require.resolve('../public/result-extraction.html'), 'utf8');
  const confirmHtml = fs.readFileSync(require.resolve('../public/result-extraction-confirm.html'), 'utf8');
  const js = fs.readFileSync(require.resolve('../public/js/result-extraction.js'), 'utf8');
  assert.match(html, /id="invalidStudentPreviews"/);
  assert.doesNotMatch(html, /Confirm and save|confirmSaveButton|confirmDialog/);
  assert.match(confirmHtml, /id="confirmAndSaveButton"/);
  assert.match(confirmHtml, /id="confirmStudentPreviews"/);
  assert.match(js, /api\/result-extractions\/preview/);
  assert.match(js, /api\/result-extractions\/validate/);
  assert.match(js, /data-field="/);
  assert.match(js, /Preview edited/);
  assert.match(js, /sessionStorage\.setItem/);
  assert.match(js, /results\/extract\/confirm/);
  const confirmJs = fs.readFileSync(require.resolve('../public/js/result-extraction-confirm.js'), 'utf8');
  assert.match(confirmJs, /api\/result-extractions\/confirm/);
  assert.doesNotMatch(js, /api\/(?:results|result-uploads)\/confirm/);
  assert.doesNotMatch(confirmJs, /saveResults|createResultsBatchService/);
});
