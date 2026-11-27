'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const extraction = require('../services/resultPdfExtractionService');

function makePdf(lines) {
  const stream = `BT\n/F1 10 Tf\n50 760 Td\n${lines.map((line, index) => `${index ? '0 -14 Td\n' : ''}(${line.replace(/([\\()])/g, '\\$1')}) Tj`).join('\n')}\nET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [0]; objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const start = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`; return Buffer.from(pdf);
}

const model = {
  listBatches: async () => [{ id: 2, batch_name: '2025 Intake' }],
  listSemesters: async () => [{ id: 12, batch_id: 2, semester_number: 1, semester_name: 'Semester 1' }],
  getSemester: async () => ({ id: 12, batch_id: 2 }),
  listExamSessions: async () => [{ id: 23, semester_id: 12, session_name: '2026 Regular' }],
  getSelectionContext: async () => ({ batchId: 2, batchName: '2025 Intake', semesterId: 12, semesterNumber: 1, semesterName: 'Semester 1', examSessionId: 23, examSessionName: '2026 Regular' })
};
const selection = { batchId: 2, semesterId: 12, examSessionId: 23 };

test('extracts a preview only, including student and subject marks', async () => {
  const file = { originalname: 'result.pdf', mimetype: 'application/pdf', buffer: makePdf(['USN: 1MV25MC052', 'Student Name: SAMPLE STUDENT', 'Semester: 1', 'MMC101 PROGRAMMING IN C 50 41 91 P']) };
  const preview = await extraction.extractPdf(file, selection, { model });
  assert.deepEqual(preview.student, { usn: '1MV25MC052', name: 'SAMPLE STUDENT' });
  assert.equal(preview.subjects[0].subjectCode, 'MMC101');
  assert.equal(preview.subjects[0].totalMarks, 91);
  assert.equal(preview.extractionMethod, 'text');
  assert.equal(Object.hasOwn(preview, 'reviewToken'), false);
});

test('preview includes only subject codes configured for the selected semester', async () => {
  const scopedModel = {
    ...model,
    getValidationReferenceData: async () => ({
      subjects: [{ subjectCode: 'MMC101', subjectName: 'PROGRAMMING IN C', maxInternalMarks: 50, maxExternalMarks: 50, totalMaximumMarks: 100 }]
    })
  };
  const file = {
    originalname: 'result.pdf', mimetype: 'application/pdf',
    buffer: makePdf([
      'USN: 1MV25MC052', 'Student Name: SAMPLE STUDENT', 'Semester: 1',
      'MMC101 PROGRAMMING IN C 50 41 91 P',
      'D25J26ECBCS UNCONFIGURED SUBJECT 35 40 75 P'
    ])
  };
  const preview = await extraction.extractPdf(file, selection, { model: scopedModel });
  assert.deepEqual(preview.subjects.map((subject) => subject.subjectCode), ['MMC101']);
  assert.deepEqual(preview.students[0].subjects.map((subject) => subject.subjectName), ['PROGRAMMING IN C']);
  await assert.rejects(
    extraction.extractPdf({ ...file, buffer: makePdf(['USN: 1MV25MC052', 'Student Name: SAMPLE STUDENT', 'Semester: 1', 'D25J26ECBCS UNCONFIGURED SUBJECT 35 40 75 P']) }, selection, { model: scopedModel }),
    { status: 422 }
  );
});

test('rejects invalid uploads and scanned PDFs without OCR', async () => {
  await assert.rejects(extraction.extractPdf({ originalname: 'result.txt', mimetype: 'text/plain', buffer: Buffer.from('text') }, selection, { model }), { status: 400 });
  await assert.rejects(extraction.extractPdf({ originalname: 'scan.pdf', mimetype: 'application/pdf', buffer: makePdf([]) }, selection, { model }), { status: 422 });
});

test('scopes academic choices through existing relationships', async () => {
  assert.equal((await extraction.listBatches({ model }))[0].id, 2);
  assert.equal((await extraction.listSemesters(2, { model }))[0].batch_id, 2);
  assert.equal((await extraction.listExamSessions(12, { model }))[0].semester_id, 12);
});
