const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_DISABLED = 'false';
const model = require('../models/analyticsModel');
const controller = require('../controllers/analyticsController');

function invoke(handler, query = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); return this; } };
    Promise.resolve(handler({ query }, res)).catch((error) => resolve({ status: 599, error }));
  });
}

test('populated representative records produce filtered overview counts and grade percentages', async () => {
  const old = model.executeQuery;
  const calls = [];
  model.executeQuery = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM students st JOIN batches b')) return [{ totalStudents: 12 }];
    if (sql.includes('totalResults')) return [{ totalResults: 3, appearedStudents: 2, totalStudents: 2, passedResults: 2, failedResults: 1, passPercentage: 66.67, averagePercentage: 72.5, averageMarks: 72.5 }];
    return [{ grade: 'A', count: 2 }, { grade: 'F', count: 1 }];
  };
  try {
    const result = await invoke(controller.getOverview, { batchId: '8', academicYear: '2025', semesterId: '2', sessionId: '9', subjectCode: 'CS101' });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.totalStudents, 2);
    assert.equal(result.body.data.totalResults, 3);
    assert.equal(result.body.data.failurePercentage, 33.33);
    assert.deepEqual(result.body.data.gradeSummary, [{ grade: 'A', count: 2, percentage: 66.67 }, { grade: 'F', count: 1, percentage: 33.33 }]);
    assert.equal(result.body.meta.filteredResultCount, 3);
    assert.deepEqual(calls[0].params, ['8', '2', '9', 'CS101', '2025']);
    assert.match(calls[0].sql, /JOIN batches b ON b\.id = sem\.batch_id/);
  } finally { model.executeQuery = old; }
});

test('overview retains roster count for a batch even when no results match', async () => {
  const old = model.executeQuery;
  model.executeQuery = async (sql) => {
    if (sql.includes('FROM students st JOIN batches b')) return [{ totalStudents: 12 }];
    if (sql.includes('totalResults')) return [{ totalResults: 0, appearedStudents: 0, passedResults: 0, failedResults: 0, passPercentage: 0, averagePercentage: 0, averageMarks: 0 }];
    return [];
  };
  try {
    const result = await invoke(controller.getOverview, { batchId: '3' });
    assert.equal(result.body.data.totalStudents, 12);
    assert.equal(result.body.data.totalResults, 0);
    assert.equal(result.body.data.appearedStudents, 0);
    assert.equal(result.body.meta.filteredResultCount, 0);
  } finally { model.executeQuery = old; }
});

test('student search is parameterized and semester SGPA uses stored grade, status and actual credits', async () => {
  const old = model.executeQuery;
  const calls = [];
  model.executeQuery = async (sql, params) => {
    calls.push({ sql, params });
    return [
      { usn: 'U1', studentName: 'A Student', batchName: 'Batch 2025', semesterId: 1, semesterNumber: 1, semesterName: 'Semester 1', sessionId: 7, sessionName: 'Final', subjectCode: 'CS1', subjectName: 'Algorithms', marks: 91, maxMarks: 100, grade: 'O', status: 'Pass', credits: 4 },
      { usn: 'U1', studentName: 'A Student', batchName: 'Batch 2025', semesterId: 1, semesterNumber: 1, semesterName: 'Semester 1', sessionId: 7, sessionName: 'Final', subjectCode: 'CS2', subjectName: 'Systems', marks: 35, maxMarks: 100, grade: 'F', status: 'Fail', credits: 3 }
    ];
  };
  try {
    const result = await invoke(controller.getStudentAnalytics, { search: 'U1', batchId: '1' });
    assert.equal(result.status, 200);
    assert.deepEqual(calls[0].params, ['1', '%U1%', '%U1%']);
    assert.match(calls[0].sql, /st\.usn LIKE \?/);
    assert.equal(result.body.data[0].semesters[0].sgpa, 5.71);
    assert.equal(result.body.data[0].cgpa, 10);
  } finally { model.executeQuery = old; }
});

test('subject analytics combines grade buckets without losing distinct-subject totals', async () => {
  const old = model.executeQuery;
  let subjectSql = '';
  model.executeQuery = async (sql) => {
    subjectSql = sql;
    return [
    { semesterId: 1, semesterName: 'Semester 1', subjectCode: 'CS1', subjectName: 'Algorithms', grade: 'A', totalResults: 2, students: 2, passed: 2, failed: 0, passPercentage: 100, averageMarks: 80, averagePercentage: 80 },
    { semesterId: 1, semesterName: 'Semester 1', subjectCode: 'CS1', subjectName: 'Algorithms', grade: 'F', totalResults: 1, students: 1, passed: 0, failed: 1, passPercentage: 0, averageMarks: 30, averagePercentage: 30 }
    ];
  };
  try {
    const result = await invoke(controller.getSubjectAnalytics);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.length, 1);
    assert.equal(result.body.data[0].totalResults, 3);
    assert.equal(result.body.data[0].passPercentage, 66.67);
    assert.equal(result.body.data[0].averageMarks, 63.33);
    assert.deepEqual(result.body.data[0].gradeDistribution.map((row) => row.count), [2, 1]);
    assert.match(subjectSql, /sub\.semester_id = sem\.id AND sub\.subject_code = r\.subject_code/);
  } finally { model.executeQuery = old; }
});

test('semester SGPA is emitted only for a single selected session and exam analytics uses stored statuses', async () => {
  const old = model.executeQuery;
  model.executeQuery = async (sql) => {
    if (sql.includes('semesterId')) return [
      { semesterId: 1, sessionId: 4, semesterNumber: 1, semesterName: 'Semester 1', usn: 'U1', marks: 90, maxMarks: 100, grade: 'O', status: 'Pass', credits: 4 },
      { semesterId: 1, sessionId: 4, semesterNumber: 1, semesterName: 'Semester 1', usn: 'U1', marks: 35, maxMarks: 100, grade: 'F', status: 'Fail', credits: 3 }
    ];
    return [{ sessionId: 4, sessionName: 'Final', totalResults: 2, students: 1, passed: 1, failed: 1, passPercentage: 50, averagePercentage: 62.5, averageMarks: 62.5 }];
  };
  try {
    const semester = await invoke(controller.getSemesterAnalytics, { sessionId: '4' });
    assert.equal(semester.body.data[0].studentCount, 1);
    assert.equal(semester.body.data[0].averageSGPA, 5.71);
    const acrossSessions = await invoke(controller.getSemesterAnalytics);
    assert.equal(acrossSessions.body.data[0].averageSGPA, null);
    const exams = await invoke(controller.getExaminationAnalytics);
    assert.equal(exams.body.data[0].passPercentage, 50);
    assert.equal(exams.body.data[0].averageMarks, 62.5);
  } finally { model.executeQuery = old; }
});

test('grade distribution returns overall and semester/examination breakdowns from stored grades', async () => {
  const old = model.executeQuery;
  model.executeQuery = async (sql) => {
    if (sql.includes('SELECT sem.id groupId')) return [{ groupId: 1, groupName: 'Semester 1', grade: 'A', count: 2 }];
    if (sql.includes('SELECT es.id groupId')) return [{ groupId: 4, groupName: 'Final', grade: 'A', count: 2 }];
    return [{ grade: 'A', count: 2 }];
  };
  try {
    const response = await invoke(controller.getGradeDistribution);
    assert.deepEqual(response.body.data.overall, [{ grade: 'A', count: 2, percentage: 100 }]);
    assert.equal(response.body.data.bySemester[0].groupName, 'Semester 1');
    assert.equal(response.body.data.byExamination[0].percentage, 100);
  } finally { model.executeQuery = old; }
});

test('comparison dimension whitelist supports batch, semester, examination, subject and academic year', async () => {
  const old = model.executeQuery;
  const calls = [];
  model.executeQuery = async (sql, params) => { calls.push({ sql, params }); return [{ label: 'cohort', totalResults: 2 }]; };
  try {
    for (const dimension of ['batch', 'academicYear', 'semester', 'examination', 'subject']) {
      const result = await invoke(controller.getPerformanceComparison, { dimension, academicYear: '2025' });
      assert.equal(result.status, 200, dimension);
      assert.deepEqual(calls.at(-1).params, ['2025']);
    }
    assert.match(calls.at(-1).sql, /CONCAT\(sem\.id, ':'/);
    assert.equal((await invoke(controller.getPerformanceComparison, { dimension: 'student' })).status, 400);
  } finally { model.executeQuery = old; }
});

test('invalid search returns 400 and empty student data is empty rather than fabricated', async () => {
  const old = model.executeQuery;
  const calls = [];
  model.executeQuery = async (...args) => { calls.push(args); return []; };
  try {
    assert.equal((await invoke(controller.getStudentAnalytics, { search: 'x'.repeat(81) })).status, 400);
    const empty = await invoke(controller.getStudentAnalytics);
    assert.deepEqual(empty.body.data, []);
    assert.equal(calls.length, 1);
  } finally { model.executeQuery = old; }
});
