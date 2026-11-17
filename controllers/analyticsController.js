'use strict';

const analyticsModel = require('../models/analyticsModel');
const { isDbDisabled } = require('../config/db');
const { calculateSGPA, calculateCGPA } = require('../services/resultCalculationService');

// The stored schema has batch.start_year (academic year), but no exam_type,
// CIE/SEE, revaluation, or backlog-history columns.
const FROM = `FROM results r
  JOIN exam_sessions es ON es.id = r.exam_session_id
  JOIN semesters sem ON sem.id = es.semester_id
  JOIN batches b ON b.id = sem.batch_id`;
const FILTERS = [
  ['batchId', 'b.id', /^[1-9]\d*$/], ['semesterId', 'sem.id', /^[1-9]\d*$/],
  ['sessionId', 'es.id', /^[1-9]\d*$/], ['subjectCode', 'r.subject_code', /^[A-Za-z0-9_-]{1,20}$/],
  ['academicYear', 'b.start_year', /^\d{4}$/]
];

function parseFilters(query = {}) {
  const clauses = [];
  const params = [];
  const rosterClauses = [];
  const rosterParams = [];
  for (const [key, column, pattern] of FILTERS) {
    if (query[key] === undefined || query[key] === '') continue;
    if (!pattern.test(String(query[key]))) return { error: `Invalid ${key}` };
    clauses.push(`${column} = ?`);
    params.push(query[key]);
    if (key === 'batchId' || key === 'academicYear') {
      rosterClauses.push(`${key === 'batchId' ? 'b.id' : 'b.start_year'} = ?`);
      rosterParams.push(query[key]);
    }
  }
  if (query.examType) return { error: 'Exam type filtering is unavailable: the database schema has no exam_type field.' };
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params,
    rosterWhere: rosterClauses.length ? `WHERE ${rosterClauses.join(' AND ')}` : '', rosterParams,
    resultScoped: Boolean(query.semesterId || query.sessionId || query.subjectCode) };
}

function responseError(res, error) {
  console.error('Analytics query failed:', error.message);
  return res.status(500).json({ success: false, error: 'Analytics data could not be loaded.' });
}

async function query(sql, params = []) {
  if (isDbDisabled()) return [];
  return analyticsModel.executeQuery(sql, params);
}

async function run(req, res, makeQuery, transform = (rows) => rows) {
  const f = parseFilters(req.query);
  if (f.error) return res.status(400).json({ success: false, error: f.error });
  try {
    const rows = await makeQuery(f);
    return res.json({ success: true, data: transform(rows), meta: { rowCount: rows.length } });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    return responseError(res, error);
  }
}

exports.getOverview = async (req, res) => {
  const f = parseFilters(req.query);
  if (f.error) return res.status(400).json({ success: false, error: f.error });
  try {
    const [summaryRows, grades, rosterRows] = await Promise.all([
      query(`SELECT COUNT(*) totalResults, COUNT(DISTINCT r.usn) appearedStudents,
      COALESCE(SUM(r.status = 'Pass'), 0) passedResults,
      COALESCE(SUM(r.status = 'Fail'), 0) failedResults,
      COALESCE(ROUND(100 * SUM(r.status = 'Pass') / NULLIF(COUNT(*), 0), 2), 0) passPercentage,
      COALESCE(ROUND(100 * AVG(r.marks_obtained / NULLIF(r.max_marks, 0)), 2), 0) averagePercentage,
      COALESCE(ROUND(AVG(r.marks_obtained), 2), 0) averageMarks
      ${FROM} ${f.where}`, f.params),
      query(`SELECT COALESCE(r.grade, 'Ungraded') grade, COUNT(*) count
        ${FROM} ${f.where} GROUP BY r.grade ORDER BY r.grade`, f.params),
      f.resultScoped ? Promise.resolve([]) : query(`SELECT COUNT(DISTINCT st.usn) totalStudents
        FROM students st JOIN batches b ON b.id = st.batch_id ${f.rosterWhere}`, f.rosterParams)
    ]);
    const row = summaryRows[0] || {};
    const totalResults = Number(row.totalResults) || 0;
    const passedResults = Number(row.passedResults) || 0;
    const gradeTotal = grades.reduce((sum, grade) => sum + (Number(grade.count) || 0), 0);
    return res.json({ success: true, data: {
      totalStudents: f.resultScoped ? Number(row.appearedStudents) || 0 : Number(rosterRows[0]?.totalStudents) || 0,
      totalResults,
      appearedStudents: Number(row.appearedStudents) || 0,
      passedResults,
      failedResults: Number(row.failedResults) || 0,
      passPercentage: Number(row.passPercentage) || 0,
      failurePercentage: totalResults ? Number((100 * (totalResults - passedResults) / totalResults).toFixed(2)) : 0,
      averageMarks: Number(row.averageMarks) || 0,
      averagePercentage: Number(row.averagePercentage) || 0,
      gradeSummary: grades.map((g) => ({ grade: g.grade || 'Ungraded', count: Number(g.count) || 0, percentage: gradeTotal ? Number((100 * Number(g.count) / gradeTotal).toFixed(2)) : 0 }))
    }, meta: { filteredResultCount: totalResults } });
  } catch (error) { return responseError(res, error); }
};

exports.getSemesterAnalytics = (req, res) => run(req, res, async (f) => {
  const rows = await query(`SELECT sem.id semesterId, es.id sessionId, sem.semester_number semesterNumber,
    sem.semester_name semesterName, r.usn, r.marks_obtained marks, r.max_marks maxMarks,
    r.grade, r.status, sub.credits
    ${FROM} LEFT JOIN subjects sub ON sub.semester_id = sem.id AND sub.subject_code = r.subject_code
    ${f.where} ORDER BY sem.semester_number, es.id, r.usn`, f.params);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.semesterId}:${row.sessionId}:${row.usn}`;
    if (!groups.has(key)) groups.set(key, { semesterId: row.semesterId, sessionId: row.sessionId, semesterNumber: row.semesterNumber, semesterName: row.semesterName, usn: row.usn, results: [], marks: [], passed: 0, failed: 0 });
    const group = groups.get(key);
    group.results.push({ grade: row.grade, status: row.status, credit: row.credits });
    group.marks.push({ marks: Number(row.marks), max: Number(row.maxMarks) });
    if (row.status === 'Pass') group.passed += 1; else if (row.status === 'Fail') group.failed += 1;
  }
  const semesters = new Map();
  for (const student of groups.values()) {
    const key = String(student.semesterId);
    if (!semesters.has(key)) semesters.set(key, { semesterId: student.semesterId, semesterNumber: student.semesterNumber, semesterName: student.semesterName, studentUsns: new Set(), totalResults: 0, passed: 0, failed: 0, percentages: [], sgpas: [] });
    const sem = semesters.get(key);
    sem.studentUsns.add(student.usn); sem.totalResults += student.results.length; sem.passed += student.passed; sem.failed += student.failed;
    sem.percentages.push(...student.marks.filter((m) => Number.isFinite(m.max) && m.max > 0).map((m) => m.marks / m.max * 100));
    const sgpa = calculateSGPA(student.results);
    // Without a selected session, repeat attempts across sessions are ambiguous;
    // do not present an average SGPA that double-counts them.
    if (sgpa !== null && req.query.sessionId) sem.sgpas.push(sgpa);
  }
  return [...semesters.values()].map((sem) => ({
    ...sem,
    studentCount: sem.studentUsns.size,
    studentUsns: undefined,
    passPercentage: sem.totalResults ? Number((100 * sem.passed / sem.totalResults).toFixed(2)) : 0,
    averagePercentage: sem.percentages.length ? Number((sem.percentages.reduce((a, b) => a + b, 0) / sem.percentages.length).toFixed(2)) : 0,
    averageSGPA: sem.sgpas.length ? Number((sem.sgpas.reduce((a, b) => a + b, 0) / sem.sgpas.length).toFixed(2)) : null
  })).sort((a, b) => a.semesterNumber - b.semesterNumber);
});

exports.getSubjectAnalytics = (req, res) => run(req, res, async (f) => query(`SELECT sem.id semesterId, sem.semester_name semesterName,
  r.subject_code subjectCode, COALESCE(sub.subject_name, r.subject_name) subjectName,
  r.grade, COUNT(*) totalResults, COUNT(DISTINCT r.usn) students,
  SUM(r.status = 'Pass') passed, SUM(r.status = 'Fail') failed,
  ROUND(100 * SUM(r.status = 'Pass') / NULLIF(COUNT(*), 0), 2) passPercentage,
  ROUND(AVG(r.marks_obtained), 2) averageMarks,
  ROUND(100 * AVG(r.marks_obtained / NULLIF(r.max_marks, 0)), 2) averagePercentage
  ${FROM} LEFT JOIN subjects sub ON sub.semester_id = sem.id AND sub.subject_code = r.subject_code
  ${f.where} GROUP BY sem.id, sem.semester_name, r.subject_code, COALESCE(sub.subject_name, r.subject_name), r.grade
  ORDER BY sem.semester_number, r.subject_code, r.grade`, f.params), (rows) => {
  const subjects = new Map();
  for (const row of rows) {
    const key = `${row.semesterId}:${row.subjectCode}`;
    if (!subjects.has(key)) subjects.set(key, { semesterId: row.semesterId, semesterName: row.semesterName, subjectCode: row.subjectCode, subjectName: row.subjectName, totalResults: 0, students: 0, passed: 0, failed: 0, passPercentage: 0, averageMarks: 0, averagePercentage: 0, gradeDistribution: [] });
    const subject = subjects.get(key);
    const count = Number(row.totalResults) || 0;
    subject.totalResults += count;
    subject.students = Math.max(subject.students, Number(row.students) || 0);
    subject.passed += Number(row.passed) || 0;
    subject.failed += Number(row.failed) || 0;
    subject.averageMarks += (Number(row.averageMarks) || 0) * count;
    subject.averagePercentage += (Number(row.averagePercentage) || 0) * count;
    subject.gradeDistribution.push({ grade: row.grade || 'Ungraded', count, percentage: 0 });
  }
  return [...subjects.values()].map((subject) => {
    subject.passPercentage = subject.totalResults ? Number((100 * subject.passed / subject.totalResults).toFixed(2)) : 0;
    subject.averageMarks = subject.totalResults ? Number((subject.averageMarks / subject.totalResults).toFixed(2)) : 0;
    subject.averagePercentage = subject.totalResults ? Number((subject.averagePercentage / subject.totalResults).toFixed(2)) : 0;
    subject.gradeDistribution = subject.gradeDistribution.map((item) => ({ ...item, percentage: subject.totalResults ? Number((100 * item.count / subject.totalResults).toFixed(2)) : 0 }));
    return subject;
  });
});

exports.getStudentAnalytics = (req, res) => run(req, res, async (f) => {
  const search = String(req.query.search || req.query.usn || '').trim();
  if (search.length > 80) throw Object.assign(new Error('Search must be 80 characters or fewer.'), { status: 400 });
  const clauses = f.where ? [f.where.slice(6)] : [];
  const params = [...f.params];
  if (search) {
    clauses.push('(st.usn LIKE ? OR st.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await query(`SELECT st.usn, st.name studentName, b.batch_name batchName,
    sem.id semesterId, sem.semester_number semesterNumber, sem.semester_name semesterName,
    es.id sessionId, es.session_name sessionName, r.subject_code subjectCode,
    COALESCE(sub.subject_name, r.subject_name) subjectName, r.marks_obtained marks,
    r.max_marks maxMarks, r.grade, r.status, sub.credits
    ${FROM} JOIN students st ON st.usn = r.usn AND st.batch_id = b.id
    LEFT JOIN subjects sub ON sub.semester_id = sem.id AND sub.subject_code = r.subject_code
    ${where} ORDER BY st.usn, sem.semester_number, es.id, r.subject_code`, params);
  const students = new Map();
  for (const row of rows) {
    if (!students.has(row.usn)) students.set(row.usn, { usn: row.usn, studentName: row.studentName, batchName: row.batchName, totalResults: 0, passed: 0, failed: 0, semesters: new Map(), results: [] });
    const student = students.get(row.usn);
    student.totalResults += 1;
    if (row.status === 'Pass') student.passed += 1; else if (row.status === 'Fail') student.failed += 1;
    student.results.push({ semesterId: row.semesterId, subjectCode: row.subjectCode, status: row.status, grade: row.grade, credit: row.credits });
    const key = `${row.semesterId}:${row.sessionId}`;
    if (!student.semesters.has(key)) student.semesters.set(key, { semesterId: row.semesterId, semesterNumber: row.semesterNumber, semesterName: row.semesterName, sessionId: row.sessionId, sessionName: row.sessionName, subjects: [], grades: [] });
    const sem = student.semesters.get(key);
    sem.subjects.push({ subjectCode: row.subjectCode, subjectName: row.subjectName, marks: Number(row.marks), maxMarks: Number(row.maxMarks), grade: row.grade, status: row.status });
    sem.grades.push({ grade: row.grade, status: row.status, credit: row.credits });
  }
  return [...students.values()].map((student) => {
    student.semesters = [...student.semesters.values()].map((sem) => ({ ...sem, sgpa: calculateSGPA(sem.grades) }));
    const resultCodes = student.results.map((item) => `${item.semesterId}:${item.subjectCode}`);
    const hasRepeatAttempt = new Set(resultCodes).size !== resultCodes.length;
    // The schema does not identify which attempt supersedes a prior attempt.
    const incompleteCumulativeScope = req.query.semesterId || req.query.sessionId || req.query.subjectCode;
    student.cgpa = hasRepeatAttempt || incompleteCumulativeScope ? null : calculateCGPA(student.results);
    student.passPercentage = student.totalResults ? Number((100 * student.passed / student.totalResults).toFixed(2)) : 0;
    return student;
  });
});

exports.getExaminationAnalytics = (req, res) => run(req, res, async (f) => query(`SELECT es.id sessionId, es.session_name sessionName,
  sem.semester_number semesterNumber, sem.semester_name semesterName, COUNT(*) totalResults,
  COUNT(DISTINCT r.usn) students, SUM(r.status = 'Pass') passed, SUM(r.status = 'Fail') failed,
  ROUND(100 * SUM(r.status = 'Pass') / NULLIF(COUNT(*), 0), 2) passPercentage,
  ROUND(100 * AVG(r.marks_obtained / NULLIF(r.max_marks, 0)), 2) averagePercentage,
  ROUND(AVG(r.marks_obtained), 2) averageMarks
  ${FROM} ${f.where} GROUP BY es.id, es.session_name, sem.semester_number, sem.semester_name ORDER BY es.id`, f.params));

exports.getGradeDistribution = (req, res) => run(req, res, async (f) => {
  const [overall, semesters, sessions] = await Promise.all([
    query(`SELECT COALESCE(r.grade, 'Ungraded') grade, COUNT(*) count
      ${FROM} ${f.where} GROUP BY r.grade ORDER BY r.grade`, f.params),
    query(`SELECT sem.id groupId, sem.semester_name groupName, COALESCE(r.grade, 'Ungraded') grade,
      COUNT(*) count
    ${FROM} ${f.where} GROUP BY sem.id, sem.semester_name, r.grade ORDER BY sem.semester_number, r.grade`, f.params),
    query(`SELECT es.id groupId, es.session_name groupName, COALESCE(r.grade, 'Ungraded') grade,
      COUNT(*) count
      ${FROM} ${f.where} GROUP BY es.id, es.session_name, r.grade ORDER BY es.id, r.grade`, f.params)
  ]);
  const normalize = (rows) => {
    const totals = new Map();
    for (const row of rows) {
      const key = row.groupId === undefined ? 'all' : String(row.groupId);
      totals.set(key, (totals.get(key) || 0) + (Number(row.count) || 0));
    }
    return rows.map((row) => {
      const count = Number(row.count) || 0;
      const total = totals.get(row.groupId === undefined ? 'all' : String(row.groupId)) || 0;
      const percentage = row.percentage === undefined ? (total ? Number((100 * count / total).toFixed(2)) : 0) : Number(row.percentage) || 0;
      return { ...row, count, percentage };
    });
  };
  return { overall: normalize(overall), bySemester: normalize(semesters), byExamination: normalize(sessions) };
});

exports.getPerformanceComparison = (req, res) => {
  const dimensions = {
    batch: ['b.id', 'b.batch_name'], academicYear: ['b.start_year', 'b.start_year'],
    semester: ['sem.id', 'sem.semester_name'], examination: ['es.id', 'es.session_name'],
    subject: ["CONCAT(sem.id, ':', r.subject_code)", "CONCAT(r.subject_code, ' - ', COALESCE(sub.subject_name, r.subject_name))"]
  };
  const dimension = req.query.dimension || 'semester';
  if (!Object.prototype.hasOwnProperty.call(dimensions, dimension)) return res.status(400).json({ success: false, error: 'Invalid comparison dimension.' });
  return run(req, res, async (f) => {
  const [key, label] = dimensions[dimension];
  return query(`SELECT ${key} id, ${label} label, COUNT(*) totalResults,
    COUNT(DISTINCT r.usn) students, SUM(r.status = 'Pass') passed, SUM(r.status = 'Fail') failed,
    ROUND(100 * SUM(r.status = 'Pass') / NULLIF(COUNT(*), 0), 2) passPercentage,
    ROUND(100 * AVG(r.marks_obtained / NULLIF(r.max_marks, 0)), 2) averagePercentage,
    ROUND(AVG(r.marks_obtained), 2) averageMarks
    ${FROM} LEFT JOIN subjects sub ON sub.semester_id = sem.id AND sub.subject_code = r.subject_code
    ${f.where} GROUP BY ${key}, ${label} ORDER BY ${key}`, f.params);
  });
};

exports.getClassAnalysis = (req, res) => run(req, res, async (f) => {
  const rows = await query(`SELECT SUM(r.status='Pass') totalPassCount, SUM(r.status='Fail') totalFailCount,
    COUNT(*) totalAppearances, ROUND(AVG(100*r.marks_obtained/NULLIF(r.max_marks,0)),2) averagePercentage
    ${FROM} ${f.where}`, f.params);
  return rows[0] || {};
});

exports.getToppers = (req, res) => run(req, res, async (f) => {
  const limit = Number(req.query.limit || 5);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Object.assign(new Error('Invalid limit'), { status: 400 });
  const where = f.where ? `${f.where} AND st.usn IS NOT NULL` : 'WHERE st.usn IS NOT NULL';
  return query(`SELECT st.usn, st.name studentName, b.batch_name batchName,
    ROUND(AVG(100*r.marks_obtained/NULLIF(r.max_marks,0)),2) percentage,
    COUNT(*) subjectsAppeared ${FROM} JOIN students st ON st.usn=r.usn AND st.batch_id=b.id ${where}
    GROUP BY st.usn, st.name, b.batch_name ORDER BY percentage DESC LIMIT ?`, [...f.params, limit]);
});

exports.getFilterOptions = async (req, res) => {
  try {
    const [batches, semesters, sessions, subjects, years] = await Promise.all([
      query('SELECT id, batch_name batchName, start_year academicYear FROM batches ORDER BY start_year DESC, batch_name'),
      query('SELECT sem.id, sem.batch_id batchId, sem.semester_number semesterNumber, sem.semester_name semesterName FROM semesters sem ORDER BY sem.semester_number'),
      query('SELECT es.id, es.semester_id semesterId, es.session_name sessionName FROM exam_sessions es ORDER BY es.id DESC'),
      query('SELECT semester_id semesterId, subject_code subjectCode, subject_name subjectName FROM subjects ORDER BY subject_code'),
      query('SELECT DISTINCT start_year academicYear FROM batches ORDER BY start_year DESC')
    ]);
    return res.json({ success: true, data: { batches, semesters, sessions, subjects, academicYears: years, examTypes: [], examTypeSupported: false } });
  } catch (error) { return responseError(res, error); }
};
