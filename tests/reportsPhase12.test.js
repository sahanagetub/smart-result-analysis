'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const express = require('express');
const XLSX = require('xlsx');

process.env.DB_DISABLED = 'false';
const model = require('../models/reportModel');
const service = require('../services/reportService');
const controller = require('../controllers/reportController');
const routes = require('../routes/reportRoutes');

const options = {
  batches: [{ id: 1, batchName: 'Batch A' }],
  semesters: [{ id: 2, batchId: 1, semesterNumber: 1, semesterName: 'Semester 1' }],
  examSessions: [{ id: 3, semesterId: 2, batchId: 1, sessionName: 'Final' }],
  subjects: [{ subjectCode: 'S1', subjectName: 'Subject 1', semesterId: 2 }, { subjectCode: 'S2', subjectName: 'Subject 2', semesterId: 2 }]
};

function result(usn, name, code, marks, status, resultId) {
  return {
    usn, studentName: name, batchId: 1, batchName: 'Batch A', semesterId: 2,
    semesterNumber: 1, semesterName: 'Semester 1', examSessionId: 3, examSessionName: 'Final',
    subjectCode: code, subjectName: `Subject ${code}`, marksObtained: marks,
    maxMarks: 100, status, resultId
  };
}

const reportRows = [
  result('A1', 'Alpha', 'S1', 90, 'Pass', 1), result('A1', 'Alpha', 'S2', 80, 'Pass', 2),
  result('B1', 'Beta', 'S1', 40, 'Fail', 3), result('B1', 'Beta', 'S2', 70, 'Pass', 4),
  result('C1', 'Gamma', 'S1', 75, 'Pass', 5), result('C1', 'Gamma', 'S2', null, null, null),
  result('D1', 'Delta', 'S1', 40, 'Fail', 7), result('D1', 'Delta', 'S2', 50, 'Fail', 8),
  result('E1', 'Epsilon', 'S1', 30, 'Fail', 9), result('E1', 'Epsilon', 'S2', null, null, null)
];

function withModelData(t, rows = reportRows) {
  const oldOptions = model.getFilterOptions;
  const oldRows = model.getReportRows;
  const oldStudentRows = model.getStudentRows;
  model.getFilterOptions = async () => options;
  model.getReportRows = async (filters) => {
    if (filters.search) return rows.filter((row) => row.usn.includes(filters.search) || row.studentName.includes(filters.search));
    return rows;
  };
  model.getStudentRows = async () => [];
  t.after(() => {
    model.getFilterOptions = oldOptions;
    model.getReportRows = oldRows;
    model.getStudentRows = oldStudentRows;
  });
}

function invoke(handler, query = {}, params = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, headers: this.headers }); return this; },
      type(value) { this.headers.type = value; return this; },
      set(key, value) { this.headers[key] = value; return this; },
      send(body) { resolve({ status: this.statusCode, body, headers: this.headers }); return this; }
    };
    Promise.resolve(handler({ query, params }, res)).catch((error) => resolve({ status: 599, error }));
  });
}

test('failed report lists explicit failed subjects and keeps incomplete students distinct', async (t) => {
  withModelData(t);
  const report = await service.buildReport('failed', { examSessionId: '3', search: 'E1' });
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].failedSubjectCount, 1);
  assert.equal(report.results[0].overallStatus, 'Incomplete');
  assert.equal(report.summary.failedStudents, 1);
  assert.equal(report.summary.incompleteStudents, 1);
  const onlyIncomplete = await service.buildReport('failed', { examSessionId: '3', search: 'C1' });
  assert.equal(onlyIncomplete.results.length, 0);
});

test('subject report calculates valid-result statistics, comparison, toppers and tied ranks', async (t) => {
  withModelData(t);
  const report = await service.buildReport('subject-wise', { examSessionId: '3' });
  const subject = report.subjects.find((row) => row.subjectCode === 'S1');
  assert.equal(subject.totalStudents, 5);
  assert.equal(subject.passedStudents, 2);
  assert.equal(subject.failedStudents, 3);
  assert.equal(subject.passPercentage, 40);
  assert.equal(subject.failPercentage, 60);
  assert.equal(subject.averageMarks, 55);
  assert.equal(subject.highestMarks, 90);
  assert.equal(subject.lowestMarks, 30);
  model.getReportRows = async () => reportRows.filter((row) => row.usn === 'A1' || row.usn === 'B1').map((row) => ({ ...row, marksObtained: 90, status: 'Pass' }));
  const equalToppers = await service.buildReport('topper', { examSessionId: '3', limit: '3' });
  assert.deepEqual(equalToppers.results.map((row) => row.rank), [1, 1]);
  const tiedRows = reportRows.map((row) => row.subjectCode === 'S1' ? { ...row, marksObtained: row.usn === 'A1' || row.usn === 'B1' ? 90 : row.marksObtained } : row);
  model.getReportRows = async () => tiedRows;
  const tied = await service.buildReport('subject-wise', { examSessionId: '3', subjectCode: 'S1' });
  assert.deepEqual(tied.subjects[0].rankings.slice(0, 2).map((row) => row.rank), [1, 1]);
  assert.deepEqual(tied.comparison.highestPassSubjects, ['S1']);
});

test('individual report uses stored grades and credits and suppresses GPA for incomplete scope', async (t) => {
  withModelData(t);
  model.getStudentRows = async (_usn, filters) => {
    const base = { usn: 'U1', studentName: 'Student One', batchId: 1, batchName: 'Batch A', academicStartYear: 2025, academicEndYear: 2027 };
    const make = (semesterId, semesterNumber, examSessionId, examSessionName, code, marks, grade, status, credits, resultId) => ({
      ...base, semesterId, semesterNumber, semesterName: `Semester ${semesterNumber}`, examSessionId,
      examSessionName, subjectCode: code, subjectName: `Subject ${code}`, marksObtained: marks,
      maxMarks: 100, grade, status, credits, resultId
    });
    const rows = [
      make(2, 1, 3, 'Final 1', 'S1', 90, 'O', 'Pass', 4, 1), make(2, 1, 3, 'Final 1', 'S2', 80, 'A+', 'Pass', 3, 2),
      make(4, 2, 5, 'Final 2', 'S3', 70, 'A', 'Pass', 4, 3), make(4, 2, 5, 'Final 2', 'S4', 60, 'B+', 'Pass', 3, 4)
    ];
    return filters.examSessionId ? rows.filter((row) => row.examSessionId === filters.examSessionId) : rows;
  };
  const all = await service.buildReport('student', { usn: 'u1' });
  assert.equal(all.student.academicSession, '2025–2027');
  assert.equal(all.results.length, 4);
  assert.equal(all.summary.percentage, null);
  assert.ok(all.summary.cgpa > 0);
  assert.deepEqual(all.semesters.map((semester) => semester.examinations[0].sgpa), [9.57, 7.57]);
  const selected = await service.buildReport('student', { usn: 'U1', examSessionId: '3' });
  assert.equal(selected.summary.totalMarks, 170);
  assert.equal(selected.summary.percentage, 85);
  assert.equal(selected.summary.sgpa, 9.57);
  assert.equal(selected.summary.cgpa, null);
  model.getStudentRows = async () => [{ usn: 'U1', studentName: 'Student One', batchId: 1, batchName: 'Batch A', academicStartYear: 2025, academicEndYear: 2027,
    semesterId: 2, semesterNumber: 1, semesterName: 'Semester 1', examSessionId: 3, examSessionName: 'Final',
    subjectCode: 'S1', subjectName: 'Subject S1', credits: 4, resultId: 1, marksObtained: 90, maxMarks: 100, grade: 'O', status: 'Pass' },
  { usn: 'U1', studentName: 'Student One', batchId: 1, batchName: 'Batch A', academicStartYear: 2025, academicEndYear: 2027,
    semesterId: 2, semesterNumber: 1, semesterName: 'Semester 1', examSessionId: 3, examSessionName: 'Final',
    subjectCode: 'S2', subjectName: 'Subject S2', credits: 3, resultId: null, marksObtained: null, maxMarks: null, grade: null, status: null }];
  const incomplete = await service.buildReport('student', { usn: 'U1', examSessionId: '3' });
  assert.equal(incomplete.summary.percentage, null);
  assert.equal(incomplete.summary.sgpa, null);
  assert.equal(incomplete.results[1].status, 'Missing');
});

test('filters validate combinations, subject membership, search bounds and unknown students', async (t) => {
  withModelData(t);
  await assert.rejects(service.buildReport('class', { examSessionId: '3', semesterId: '99' }), /does not belong/);
  await assert.rejects(service.buildReport('subject-wise', { examSessionId: '3', subjectCode: 'BAD' }), /does not belong/);
  await assert.rejects(service.buildReport('failed', { examSessionId: '3', search: 'x'.repeat(81) }), /80 characters/);
  await assert.rejects(service.buildReport('student', { usn: 'UNKNOWN' }), { status: 404 });
});

test('all six report routes require staff authentication', async (t) => {
  const app = express();
  app.use('/api/reports', routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  for (const path of ['filters', 'consolidated', 'class', 'topper', 'failed', 'subject-wise', 'student', 'export/failed']) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/reports/${path}`);
    assert.equal(response.status, 401, path);
  }
});

test('authenticated staff can call all six report APIs and receive consistent JSON envelopes', async (t) => {
  const oldOptions = model.getFilterOptions;
  const oldRows = model.getReportRows;
  const oldStudentRows = model.getStudentRows;
  model.getFilterOptions = async () => options;
  model.getReportRows = async () => reportRows;
  model.getStudentRows = async () => [{ usn: 'U1', studentName: 'Student One', batchId: 1, batchName: 'Batch A', academicStartYear: 2025, academicEndYear: 2027,
    semesterId: 2, semesterNumber: 1, semesterName: 'Semester 1', examSessionId: 3, examSessionName: 'Final',
    subjectCode: 'S1', subjectName: 'Subject 1', credits: 4, resultId: 1, marksObtained: 90, maxMarks: 100, grade: 'O', status: 'Pass' }];
  t.after(() => { model.getFilterOptions = oldOptions; model.getReportRows = oldRows; model.getStudentRows = oldStudentRows; });
  const app = express();
  app.use((req, _res, next) => { req.session = { user: { username: 'staff-test', role: 'Staff' } }; next(); });
  app.use('/api/reports', routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/reports`;
  const paths = [
    '/filters', '/consolidated?examSessionId=3', '/class?examSessionId=3',
    '/topper?examSessionId=3&limit=3', '/failed?examSessionId=3',
    '/subject-wise?examSessionId=3', '/student?usn=U1&examSessionId=3'
  ];
  for (const path of paths) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    const payload = await response.json();
    assert.equal(payload.success, true, path);
    assert.ok(payload.data, path);
  }
});

test('CSV and XLSX exports have useful headers, summaries and workbook bytes for all six reports', async (t) => {
  const original = service.buildReport;
  const student = { usn: 'U1', studentName: 'Student One', batchName: 'Batch A', academicSession: '2025–2027' };
  service.buildReport = async (type) => {
    const filters = { examSessionId: 3, semesterId: 2, batchId: 1, usn: 'U1', search: 'U1', subjectCode: 'S1' };
    if (type === 'class') return { type, filters, statistics: { totalStudents: 1, passedStudents: 1, failedStudents: 0, incompleteStudents: 0, passPercentage: 100, classAveragePercentage: 90, highestPercentage: 90, lowestPercentage: 90 }, results: [] };
    if (type === 'failed') return { type, filters, summary: { failedStudents: 1, incompleteStudents: 0, studentsWithFailuresAndIncompleteRecords: 0 }, results: [{ ...student, semesterName: 'Semester 1', examSessionName: 'Final', failedSubjectCount: 1, failedSubjects: [{ subjectCode: 'S1', subjectName: 'Subject 1', marksObtained: 20, maxMarks: 100 }], subjects: [{ subjectCode: 'S1', marksObtained: 20, maxMarks: 100, status: 'Fail' }], overallStatus: 'Fail' }] };
    if (type === 'subject-wise') return { type, filters, comparison: { highestPassPercentage: 100, highestPassSubjects: ['S1'], lowestPassPercentage: 100, lowestPassSubjects: ['S1'] }, subjects: [{ subjectCode: 'S1', subjectName: 'Subject 1', semesterName: 'Semester 1', totalStudents: 1, passedStudents: 1, failedStudents: 0, passPercentage: 100, failPercentage: 0, averageMarks: 90, highestMarks: 90, lowestMarks: 90, topper: [], rankings: [] }] };
    if (type === 'student') return { type, filters, student, summary: { totalMarks: 90, maxMarks: 100, percentage: 90, sgpa: 9, cgpa: null, subjectsPassed: 1, subjectsFailed: 0, overallStatus: 'Pass' }, semesters: [], results: [{ semesterId: 2, semesterName: 'Semester 1', semesterNumber: 1, examSessionId: 3, examSessionName: 'Final', subjectCode: 'S1', subjectName: 'Subject 1', marksObtained: 90, maxMarks: 100, grade: 'O', status: 'Pass' }] };
    return { type, filters, results: [{ ...student, semesterName: 'Semester 1', examSessionName: 'Final', subjects: [{ subjectCode: 'S1', subjectName: 'Subject 1', marksObtained: 90, maxMarks: 100, status: 'Pass' }], totalMarks: 90, maxMarks: 100, percentage: 90, status: 'Pass', rank: 1 }] };
  };
  t.after(() => { service.buildReport = original; });
  for (const type of ['consolidated', 'class', 'topper', 'failed', 'subject-wise', 'student']) {
    const csv = await invoke(controller.export, { examSessionId: '3', format: 'csv' }, { type });
    assert.equal(csv.status, 200, `${type} CSV`);
    assert.match(csv.headers.type, /text\/csv/);
    assert.match(csv.body, /USN|Subject code/);
    const xlsx = await invoke(controller.export, { examSessionId: '3', format: 'xlsx' }, { type });
    assert.equal(xlsx.status, 200, `${type} XLSX`);
    assert.ok(Buffer.isBuffer(xlsx.body));
    assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK');
    const workbook = XLSX.read(xlsx.body, { type: 'buffer' });
    assert.ok(workbook.SheetNames.length > 0, `${type} workbook has a sheet`);
    const sheetCsv = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
    const exportHeader = {
      class: /Total students/, failed: /Students with failed subjects/,
      'subject-wise': /Highest pass percentage/, student: /USN/,
      consolidated: /USN/, topper: /USN/
    }[type];
    assert.match(sheetCsv, exportHeader, `${type} workbook summary values`);
    assert.match(csv.body, /USN|Subject code/);
  }
  service.buildReport = async () => ({ type: 'consolidated', filters: { examSessionId: 3 }, results: [] });
  const emptyCsv = await invoke(controller.export, { examSessionId: '3', format: 'csv' }, { type: 'consolidated' });
  assert.match(emptyCsv.body, /USN/);
});

test('Reports interface exposes all six types, filters, exports and subject charts', () => {
  const page = fs.readFileSync(require.resolve('../views/reports/index.ejs'), 'utf8');
  const script = fs.readFileSync(require.resolve('../public/js/reports.js'), 'utf8');
  for (const type of ['consolidated', 'class', 'topper', 'failed', 'subject-wise', 'student']) assert.match(page, new RegExp(`data-report-tab="${type}"`));
  for (const id of ['reportBatch', 'reportSemester', 'reportSession', 'reportSubject', 'studentUsn', 'resetReportFilters']) assert.match(page, new RegExp(`id="${id}"`));
  for (const id of ['subjectAverageChart', 'subjectPassFailChart', 'subjectComparisonChart']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(script, /data-export/);
  assert.match(script, /window\.apiFetch/);
});
