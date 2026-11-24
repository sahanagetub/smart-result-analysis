'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const analyticsModel = require('../models/analyticsModel');
const controller = require('../controllers/analyticsController');

// Controlled synthetic fixtures only; these rows are invented for analytics
// checks and are not actual student records or uploaded academic results.
const studentMarks = [
  { usn: 'SYNTH-P17-01', studentName: 'Synthetic One', totals: [90, 80, 90], statuses: ['Pass', 'Pass', 'Pass'] },
  { usn: 'SYNTH-P17-02', studentName: 'Synthetic Two', totals: [90, 45, 60], statuses: ['Pass', 'Fail', 'Pass'] },
  { usn: 'SYNTH-P17-03', studentName: 'Synthetic Three', totals: [80, 75, 70], statuses: ['Pass', 'Pass', 'Pass'] },
  { usn: 'SYNTH-P17-04', studentName: 'Synthetic Four', totals: [49, 70, 60], statuses: ['Fail', 'Pass', 'Pass'] },
  { usn: 'SYNTH-P17-05', studentName: 'Synthetic Five', totals: [98, 92, 95], statuses: ['Pass', 'Pass', 'Pass'] }
];
const subjects = [
  { code: 'SYN101', name: 'Synthetic Algorithms', credit: 3 },
  { code: 'SYN102', name: 'Synthetic Databases', credit: 4 },
  { code: 'SYN103', name: 'Synthetic Networks', credit: 3 }
];
const grade = (mark) => mark >= 90 ? 'O' : mark >= 80 ? 'A+' : mark >= 70 ? 'A' : mark >= 60 ? 'B+' : mark >= 55 ? 'B' : mark >= 50 ? 'C' : 'F';
const rows = studentMarks.flatMap((student) => student.totals.map((marks, index) => ({
  usn: student.usn, studentName: student.studentName, batchName: 'Synthetic Phase 17',
  semesterId: 2, semesterNumber: 1, semesterName: 'Synthetic Semester 1', sessionId: 3,
  sessionName: 'Synthetic Calculation Session', subjectCode: subjects[index].code,
  subjectName: subjects[index].name, marks, maxMarks: 100, grade: grade(marks),
  status: student.statuses[index], credits: subjects[index].credit
})));
const totalPassed = rows.filter((row) => row.status === 'Pass').length;
const totalFailed = rows.filter((row) => row.status === 'Fail').length;
const sumMarks = rows.reduce((sum, row) => sum + row.marks, 0);

function invoke(handler, query = {}) {
  return new Promise((resolve) => {
    const res = {
      code: 200,
      status(code) { this.code = code; return this; },
      json(body) { resolve({ status: this.code, body }); }
    };
    Promise.resolve(handler({ query }, res)).catch((error) => resolve({ status: 599, error }));
  });
}

test('synthetic known results produce expected overview, semester, subject, student and examination analytics', async (t) => {
  const original = analyticsModel.executeQuery;
  const executeQuery = async (sql) => {
    if (sql.includes('totalResults') && sql.includes('appearedStudents')) return [{
      totalResults: 15, appearedStudents: 5, passedResults: totalPassed, failedResults: totalFailed,
      passPercentage: 86.67, averagePercentage: Number((100 * sumMarks / 1500).toFixed(2)), averageMarks: Number((sumMarks / 15).toFixed(2))
    }];
    if (sql.includes('totalStudents')) return [{ totalStudents: 5 }];
    if (sql.includes('totalPassCount')) return [{ totalPassCount: totalPassed, totalFailCount: totalFailed, totalAppearances: 15, averagePercentage: 76.27 }];
    if (sql.includes('subjectsAppeared')) return studentMarks.map((student) => ({
      usn: student.usn, studentName: student.studentName, batchName: 'Synthetic Phase 17',
      percentage: Number((100 * student.totals.reduce((sum, value) => sum + value, 0) / 300).toFixed(2)),
      subjectsAppeared: 3
    })).sort((a, b) => b.percentage - a.percentage);
    if (sql.includes('groupId') && sql.includes('sem.semester_name')) {
      return [...new Set(rows.map((row) => row.grade))].map((gradeValue) => ({ groupId: 2, groupName: 'Synthetic Semester 1', grade: gradeValue, count: rows.filter((row) => row.grade === gradeValue).length }));
    }
    if (sql.includes('groupId') && sql.includes('es.session_name')) {
      return [...new Set(rows.map((row) => row.grade))].map((gradeValue) => ({ groupId: 3, groupName: 'Synthetic Calculation Session', grade: gradeValue, count: rows.filter((row) => row.grade === gradeValue).length }));
    }
    if (sql.includes('COUNT(*) count') && sql.includes('GROUP BY r.grade')) {
      const counts = new Map();
      rows.forEach((row) => counts.set(row.grade, (counts.get(row.grade) || 0) + 1));
      return [...counts].map(([gradeValue, count]) => ({ grade: gradeValue, count }));
    }
    if (sql.includes('semesterId') && sql.includes('r.usn') && sql.includes('r.marks_obtained marks')) return rows;
    if (sql.includes('r.subject_code subjectCode')) {
      const groups = new Map();
      rows.forEach((row) => {
        const key = `${row.subjectCode}:${row.grade}`;
        const group = groups.get(key) || { ...row, totalResults: 0, students: 0, passed: 0, failed: 0, marksSum: 0, pctSum: 0 };
        group.totalResults += 1;
        group.students += 1;
        group.passed += row.status === 'Pass' ? 1 : 0;
        group.failed += row.status === 'Fail' ? 1 : 0;
        group.marksSum += row.marks;
        group.pctSum += row.marks;
        groups.set(key, group);
      });
      return [...groups.values()].map((group) => ({
        semesterId: group.semesterId, semesterName: group.semesterName,
        subjectCode: group.subjectCode, subjectName: group.subjectName, grade: group.grade,
        totalResults: group.totalResults, students: group.students, passed: group.passed,
        failed: group.failed, passPercentage: 100 * group.passed / group.totalResults,
        averageMarks: group.marksSum / group.totalResults, averagePercentage: group.pctSum / group.totalResults
      }));
    }
    if (sql.includes('st.usn') && sql.includes('studentName')) return rows.map((row) => ({
      usn: row.usn, studentName: row.studentName, batchName: row.batchName,
      semesterId: row.semesterId, semesterNumber: row.semesterNumber, semesterName: row.semesterName,
      sessionId: row.sessionId, sessionName: row.sessionName, subjectCode: row.subjectCode,
      subjectName: row.subjectName, marks: row.marks, maxMarks: row.maxMarks,
      grade: row.grade, status: row.status, credits: row.credits
    }));
    if (sql.includes('COUNT(DISTINCT r.usn) students') && sql.includes('es.id sessionId')) return [{
      sessionId: 3, sessionName: 'Synthetic Calculation Session', semesterNumber: 1,
      semesterName: 'Synthetic Semester 1', totalResults: 15, students: 5,
      passed: totalPassed, failed: totalFailed, passPercentage: 86.67,
      averagePercentage: Number((100 * sumMarks / 1500).toFixed(2)), averageMarks: Number((sumMarks / 15).toFixed(2))
    }];
    if (sql.includes('totalPassCount')) return [{ totalPassCount: totalPassed, totalFailCount: totalFailed, totalAppearances: 15, averagePercentage: 76.27 }];
    if (sql.includes('label, COUNT(*) totalResults')) return [{ id: '2', label: 'Synthetic Semester 1', totalResults: 15, students: 5, passed: totalPassed, failed: totalFailed, passPercentage: 86.67, averagePercentage: 76.27, averageMarks: 76.27 }];
    if (sql.includes('SELECT id, batch_name')) return [{ id: 1, batchName: 'Synthetic Phase 17', academicYear: 2025 }];
    if (sql.includes('semester_number semesterNumber')) return [{ id: 2, batchId: 1, semesterNumber: 1, semesterName: 'Synthetic Semester 1' }];
    if (sql.includes('session_name sessionName')) return [{ id: 3, semesterId: 2, sessionName: 'Synthetic Calculation Session' }];
    if (sql.includes('subject_code subjectCode')) return subjects.map((subject) => ({ semesterId: 2, subjectCode: subject.code, subjectName: subject.name }));
    if (sql.includes('DISTINCT start_year')) return [{ academicYear: 2025 }];
    return [];
  };
  analyticsModel.executeQuery = executeQuery;
  t.after(() => { analyticsModel.executeQuery = original; });

  const overview = await invoke(controller.getOverview);
  assert.equal(overview.status, 200);
  assert.deepEqual({
    totalStudents: overview.body.data.totalStudents, totalResults: overview.body.data.totalResults,
    appearedStudents: overview.body.data.appearedStudents, passed: overview.body.data.passedResults,
    failed: overview.body.data.failedResults, passPercentage: overview.body.data.passPercentage,
    averagePercentage: overview.body.data.averagePercentage
  }, { totalStudents: 5, totalResults: 15, appearedStudents: 5, passed: 13, failed: 2, passPercentage: 86.67, averagePercentage: 76.27 });

  const semester = await invoke(controller.getSemesterAnalytics, { sessionId: '3' });
  assert.equal(semester.body.data[0].totalResults, 15);
  assert.equal(semester.body.data[0].studentCount, 5);
  assert.equal(semester.body.data[0].passed, 13);
  assert.equal(semester.body.data[0].failed, 2);
  assert.equal(semester.body.data[0].passPercentage, 86.67);

  const subject = await invoke(controller.getSubjectAnalytics);
  assert.deepEqual(subject.body.data.map((item) => [item.subjectCode, item.totalResults, item.passed, item.failed]), [
    ['SYN101', 5, 4, 1], ['SYN102', 5, 4, 1], ['SYN103', 5, 5, 0]
  ]);
  assert.deepEqual(subject.body.data.map((item) => item.passPercentage), [80, 80, 100]);

  const students = await invoke(controller.getStudentAnalytics);
  assert.equal(students.body.data.length, 5);
  assert.deepEqual(students.body.data.map((item) => item.totalResults), [3, 3, 3, 3, 3]);
  assert.deepEqual(students.body.data.map((item) => item.passPercentage), [100, 66.67, 100, 66.67, 100]);
  assert.deepEqual(students.body.data.map((item) => item.semesters[0].sgpa), [9.6, 5.1, 8.3, 5.3, 10]);

  const exam = await invoke(controller.getExaminationAnalytics);
  assert.equal(exam.body.data[0].students, 5);
  assert.equal(exam.body.data[0].passPercentage, 86.67);

  const classAnalysis = await invoke(controller.getClassAnalysis);
  assert.deepEqual(classAnalysis.body.data, { totalPassCount: 13, totalFailCount: 2, totalAppearances: 15, averagePercentage: 76.27 });
  const toppers = await invoke(controller.getToppers, { limit: '5' });
  assert.deepEqual(toppers.body.data.slice(0, 3).map((student) => student.usn), ['SYNTH-P17-05', 'SYNTH-P17-01', 'SYNTH-P17-03']);
  const grades = await invoke(controller.getGradeDistribution);
  assert.ok(grades.body.data.overall.length > 0);
  assert.ok(grades.body.data.bySemester.every((item) => item.percentage > 0));
  assert.ok(grades.body.data.byExamination.every((item) => item.percentage > 0));
  const comparison = await invoke(controller.getPerformanceComparison, { dimension: 'semester' });
  assert.equal(comparison.body.data[0].passPercentage, 86.67);
  const filters = await invoke(controller.getFilterOptions);
  assert.equal(filters.body.data.batches[0].batchName, 'Synthetic Phase 17');
});
