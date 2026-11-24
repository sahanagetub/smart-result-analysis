'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const calculation = require('../services/resultCalculationService');
const reportModel = require('../models/reportModel');
const reportService = require('../services/reportService');

// Five wholly synthetic students and marks, designed for calculation tests.
// These names/USNs do not represent uploaded or actual academic records.
const subjects = [
  { code: 'SYN101', name: 'Synthetic Algorithms', credit: 3 },
  { code: 'SYN102', name: 'Synthetic Databases', credit: 4 },
  { code: 'SYN103', name: 'Synthetic Networks', credit: 3 }
];
const students = [
  { usn: 'SYNTH-P17-01', name: 'Synthetic One', marks: [[45, 45], [40, 40], [50, 40]] },
  { usn: 'SYNTH-P17-02', name: 'Synthetic Two', marks: [[45, 45], [30, 15], [30, 30]] },
  { usn: 'SYNTH-P17-03', name: 'Synthetic Three', marks: [[40, 40], [35, 40], [35, 35]] },
  { usn: 'SYNTH-P17-04', name: 'Synthetic Four', marks: [[25, 24], [30, 40], [30, 30]] },
  { usn: 'SYNTH-P17-05', name: 'Synthetic Five', marks: [[48, 50], [46, 46], [45, 50]] }
];

function expectedSubject([internal, external]) {
  const total = internal + external;
  const passed = internal >= 25 && external >= 20 && total >= 50;
  const percentage = total;
  const grade = percentage >= 90 ? 'O' : percentage >= 80 ? 'A+' : percentage >= 70 ? 'A' : percentage >= 60 ? 'B+' : percentage >= 55 ? 'B' : percentage >= 50 ? 'C' : 'F';
  return { internal, external, total, status: passed ? 'Pass' : 'Fail', grade };
}

const expectedStudents = students.map((student) => {
  const rows = student.marks.map(expectedSubject);
  const totalMarks = rows.reduce((sum, row) => sum + row.total, 0);
  const totalPossible = rows.length * 100;
  const percentage = Number((100 * totalMarks / totalPossible).toFixed(2));
  const failedSubjectCount = rows.filter((row) => row.status === 'Fail').length;
  const status = failedSubjectCount === 0 ? 'Pass' : 'Fail';
  const gradePoints = { O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, F: 0 };
  const credits = rows.reduce((sum, row, index) => sum + subjects[index].credit, 0);
  const sgpa = Number((rows.reduce((sum, row, index) => sum + gradePoints[row.grade] * subjects[index].credit, 0) / credits).toFixed(2));
  const passedCredits = rows.reduce((sum, row, index) => sum + (row.status === 'Pass' ? subjects[index].credit : 0), 0);
  const cgpa = Number((rows.reduce((sum, row, index) => sum + (row.status === 'Pass' ? gradePoints[row.grade] * subjects[index].credit : 0), 0) / passedCredits).toFixed(2));
  return { ...student, rows, totalMarks, totalPossible, percentage, failedSubjectCount, status, sgpa, cgpa };
});

function reportRows() {
  return expectedStudents.flatMap((student) => student.rows.map((row, index) => ({
    usn: student.usn, studentName: student.name, batchId: 1, batchName: 'Synthetic Phase 17',
    semesterId: 2, semesterNumber: 1, semesterName: 'Synthetic Semester 1',
    examSessionId: 3, examSessionName: 'Synthetic Calculation Session',
    subjectCode: subjects[index].code, subjectName: subjects[index].name,
    marksObtained: row.total, maxMarks: 100, status: row.status, grade: row.grade,
    resultId: `${student.usn}-${subjects[index].code}`
  })));
}

test('five synthetic students: independently expected totals, percentage, pass/fail, failures, SGPA and ranking match application calculations', async (t) => {
  const appRows = reportRows();
  for (const student of expectedStudents) {
    const actualRows = student.marks.map(([internal, external]) => {
      const total = calculation.calculateTotalMarks(internal, external);
      const outcome = calculation.determineSubjectResult(internal, external, total);
      return { internal, external, total, status: outcome.status, grade: outcome.grade };
    });
    assert.deepEqual(actualRows, student.rows, student.usn);
    assert.equal(student.totalMarks, student.rows.reduce((sum, row) => sum + row.total, 0));
    assert.equal(student.percentage, Number((100 * student.totalMarks / student.totalPossible).toFixed(2)));
    assert.equal(student.failedSubjectCount, student.rows.filter((row) => row.status === 'Fail').length);
    const sgpaInputs = student.rows.map((row, index) => ({ ...row, credit: subjects[index].credit }));
    assert.equal(calculation.calculateSGPA(sgpaInputs), student.sgpa, student.usn);
    assert.equal(calculation.calculateCGPA(sgpaInputs), student.cgpa, student.usn);
  }

  const sorted = [...expectedStudents].sort((a, b) => b.percentage - a.percentage || a.usn.localeCompare(b.usn));
  assert.deepEqual(expectedStudents.map((student) => [student.totalMarks, student.percentage, student.failedSubjectCount, student.sgpa, student.cgpa]), [
    [260, 86.67, 0, 9.6, 9.6], [195, 65, 1, 5.1, 8.5], [225, 75, 0, 8.3, 8.3],
    [179, 59.67, 1, 5.3, 7.57], [285, 95, 0, 10, 10]
  ]);
  assert.deepEqual(sorted.map((student, index) => [student.usn, index + 1]), [
    ['SYNTH-P17-05', 1], ['SYNTH-P17-01', 2], ['SYNTH-P17-03', 3], ['SYNTH-P17-02', 4], ['SYNTH-P17-04', 5]
  ]);

  const originalOptions = reportModel.getFilterOptions;
  const originalRows = reportModel.getReportRows;
  const originalStudentRows = reportModel.getStudentRows;
  reportModel.getFilterOptions = async () => ({
    batches: [{ id: 1, batchName: 'Synthetic Phase 17' }],
    semesters: [{ id: 2, batchId: 1, semesterNumber: 1, semesterName: 'Synthetic Semester 1' }],
    examSessions: [{ id: 3, semesterId: 2, batchId: 1, sessionName: 'Synthetic Calculation Session' }],
    subjects: subjects.map((subject) => ({ subjectCode: subject.code, subjectName: subject.name, semesterId: 2 }))
  });
  reportModel.getReportRows = async (filters = {}) => appRows.filter((row) =>
    (!filters.batchId || Number(filters.batchId) === row.batchId) &&
    (!filters.semesterId || Number(filters.semesterId) === row.semesterId) &&
    (!filters.examSessionId || Number(filters.examSessionId) === row.examSessionId) &&
    (!filters.subjectCode || filters.subjectCode === row.subjectCode)
  );
  reportModel.getStudentRows = async (usn) => appRows.filter((row) => row.usn === usn).map((row) => ({
    ...row, credits: subjects.find((subject) => subject.code === row.subjectCode).credit,
    academicStartYear: 2025, academicEndYear: 2027
  }));
  t.after(() => {
    reportModel.getFilterOptions = originalOptions;
    reportModel.getReportRows = originalRows;
    reportModel.getStudentRows = originalStudentRows;
  });

  const classReport = await reportService.buildReport('class', { examSessionId: '3' });
  const summaryReport = await reportService.buildReport('consolidated', { examSessionId: '3', batchId: '1', semesterId: '2' });
  assert.equal(summaryReport.results.length, 5);
  assert.deepEqual(summaryReport.results.map((student) => student.usn), students.map((student) => student.usn));
  const filteredSubjectReport = await reportService.buildReport('subject-wise', { examSessionId: '3', subjectCode: 'SYN101' });
  assert.equal(filteredSubjectReport.subjects.length, 1);
  assert.equal(filteredSubjectReport.subjects[0].subjectCode, 'SYN101');
  assert.deepEqual(classReport.statistics, {
    totalStudents: 5, passedStudents: 3, failedStudents: 2, incompleteStudents: 0,
    passPercentage: 60, classAveragePercentage: 76.27, highestPercentage: 95,
    lowestPercentage: 59.67
  });
  const topperReport = await reportService.buildReport('topper', { examSessionId: '3', limit: '5' });
  assert.deepEqual(topperReport.results.map((student) => [student.usn, student.rank]), [
    ['SYNTH-P17-05', 1], ['SYNTH-P17-01', 2], ['SYNTH-P17-03', 3]
  ]);
  const failedReport = await reportService.buildReport('failed', { examSessionId: '3' });
  assert.deepEqual(failedReport.results.map((student) => [student.usn, student.failedSubjectCount]), [
    ['SYNTH-P17-02', 1], ['SYNTH-P17-04', 1]
  ]);
  const subjectReport = await reportService.buildReport('subject-wise', { examSessionId: '3' });
  assert.deepEqual(subjectReport.subjects.map((subject) => [subject.subjectCode, subject.totalStudents, subject.passedStudents, subject.failedStudents]), [
    ['SYN101', 5, 4, 1], ['SYN102', 5, 4, 1], ['SYN103', 5, 5, 0]
  ]);
  for (const student of expectedStudents) {
    const individual = await reportService.buildReport('student', { usn: student.usn, examSessionId: '3' });
    assert.equal(individual.summary.totalMarks, student.totalMarks, student.usn);
    assert.equal(individual.summary.percentage, student.percentage, student.usn);
    assert.equal(individual.summary.sgpa, student.sgpa, student.usn);
    assert.equal(individual.summary.cgpa, null, 'filtered single session intentionally suppresses CGPA');
    assert.equal(individual.summary.subjectsFailed, student.failedSubjectCount, student.usn);
    const cumulative = await reportService.buildReport('student', { usn: student.usn });
    assert.equal(cumulative.summary.cgpa, student.cgpa, student.usn);
  }
});
