'use strict';

const { getPool, isDbDisabled } = require('../config/db');

const EMPTY_DASHBOARD = Object.freeze({
  summary: {
    totalStudents: 0, totalBatches: 0, totalSemesters: 0, totalSubjects: 0,
    totalExamSessions: 0, totalResults: 0, resultsAvailable: 0,
    passedResults: 0, failedResults: 0, passedStudents: 0, failedStudents: 0,
    overallPassPercentage: 0, overallFailurePercentage: 0, averageMarks: 0, hasData: false
  },
  charts: {
    passFail: { passed: 0, failed: 0 },
    gradeDistribution: [], semesterPerformance: [], examWisePerformance: [], subjectPerformance: []
  },
  topPerformers: [],
  recentExams: []
});

function buildFilters(query = {}) {
  const clauses = [];
  const params = [];
  if (query.academicYear) { clauses.push('b.start_year = ?'); params.push(Number(query.academicYear)); }
  if (query.batchId) { clauses.push('b.id = ?'); params.push(Number(query.batchId)); }
  if (query.semesterId) { clauses.push('s.id = ?'); params.push(Number(query.semesterId)); }
  if (query.semester) { clauses.push('s.semester_number = ?'); params.push(Number(query.semester)); }
  if (query.sessionId) { clauses.push('es.id = ?'); params.push(Number(query.sessionId)); }
  if (query.subjectCode) { clauses.push('su.subject_code = ?'); params.push(String(query.subjectCode)); }
  if (query.examType) { clauses.push('LOWER(es.session_name) LIKE ?'); params.push(`%${String(query.examType).toLowerCase()}%`); }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function resultJoins() {
  return `FROM results r
    JOIN exam_sessions es ON es.id = r.exam_session_id
    JOIN semesters s ON s.id = es.semester_id
    JOIN batches b ON b.id = s.batch_id
    JOIN subjects su ON su.semester_id = s.id AND su.subject_code = r.subject_code`;
}

function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rankToppers(rows) {
  let rank = 0;
  let previous = null;
  return rows.map((row, index) => {
    const averagePercentage = Math.round(numeric(row.averagePercentage) * 100) / 100;
    if (previous === null || averagePercentage !== previous) rank = index + 1;
    previous = averagePercentage;
    return {
      rank,
      studentId: row.studentId,
      usn: row.usn,
      studentName: row.studentName,
      batchName: row.batchName,
      averagePercentage,
      resultCount: numeric(row.resultCount)
    };
  });
}

function createDashboardService(dependencies = {}) {
  const poolProvider = dependencies.getPool || getPool;
  const dbDisabled = dependencies.isDbDisabled || isDbDisabled;

  async function getFilterOptions() {
    if (dbDisabled()) return { years: [], batches: [], semesters: [], sessions: [], subjects: [], examTypes: [] };
    const pool = poolProvider();
    if (!pool) return { years: [], batches: [], semesters: [], sessions: [], subjects: [], examTypes: [] };
    const [years] = await pool.execute('SELECT DISTINCT start_year AS value FROM batches ORDER BY start_year DESC');
    const [batches] = await pool.execute('SELECT id, batch_name AS name, start_year AS startYear FROM batches ORDER BY start_year DESC, batch_name');
    const [semesters] = await pool.execute('SELECT id, batch_id AS batchId, semester_number AS semesterNumber, semester_name AS name FROM semesters ORDER BY batch_id, semester_number');
    const [sessions] = await pool.execute('SELECT id, semester_id AS semesterId, session_name AS name FROM exam_sessions ORDER BY id DESC');
    const [subjects] = await pool.execute('SELECT id, semester_id AS semesterId, subject_code AS code, subject_name AS name FROM subjects WHERE status = ? ORDER BY semester_id, subject_code', ['Active']);
    const examTypes = [...new Set(sessions.map((row) => String(row.name).trim()).filter(Boolean))];
    return { years: years.map((row) => row.value), batches, semesters, sessions, subjects, examTypes };
  }

  async function getDashboardData(query = {}) {
    if (dbDisabled()) return JSON.parse(JSON.stringify(EMPTY_DASHBOARD));
    const pool = poolProvider();
    if (!pool) return JSON.parse(JSON.stringify(EMPTY_DASHBOARD));
    const { where, params } = buildFilters(query);
    const joins = resultJoins();

    const [aggregateRows] = await pool.execute(
      `SELECT COUNT(*) AS totalResults,
              COUNT(DISTINCT r.usn) AS resultsAvailable,
              SUM(CASE WHEN r.status = 'Pass' THEN 1 ELSE 0 END) AS passedResults,
              SUM(CASE WHEN r.status = 'Fail' THEN 1 ELSE 0 END) AS failedResults,
              COUNT(DISTINCT CASE WHEN r.status = 'Pass' THEN r.usn END) AS passedStudents,
              COUNT(DISTINCT CASE WHEN r.status = 'Fail' THEN r.usn END) AS failedStudents,
              ROUND(AVG(r.marks_obtained), 2) AS averageMarks,
              ROUND(MAX(r.marks_obtained / NULLIF(r.max_marks, 0) * 100), 2) AS highestPercentage,
              ROUND(MIN(r.marks_obtained / NULLIF(r.max_marks, 0) * 100), 2) AS lowestPercentage
       ${joins} ${where}`,
      params
    );
    const [inventoryRows] = await pool.execute(
      `SELECT COUNT(DISTINCT st.id) AS totalStudents,
              COUNT(DISTINCT b.id) AS totalBatches,
              COUNT(DISTINCT s.id) AS totalSemesters,
              COUNT(DISTINCT su.id) AS totalSubjects,
              COUNT(DISTINCT es.id) AS totalExamSessions
       FROM batches b
       LEFT JOIN students st ON st.batch_id = b.id
       LEFT JOIN semesters s ON s.batch_id = b.id
       LEFT JOIN exam_sessions es ON es.semester_id = s.id
       LEFT JOIN subjects su ON su.semester_id = s.id
       ${where}`,
      params
    );
    const [gradeRows] = await pool.execute(
      `SELECT COALESCE(r.grade, 'Ungraded') AS grade, COUNT(*) AS resultCount
       ${joins} ${where} GROUP BY COALESCE(r.grade, 'Ungraded') ORDER BY grade`,
      params
    );
    const [semesterRows] = await pool.execute(
      `SELECT s.id AS semesterId, s.semester_name AS semesterName,
              COUNT(*) AS resultCount,
              SUM(CASE WHEN r.status = 'Pass' THEN 1 ELSE 0 END) AS passedResults,
              ROUND(AVG(r.marks_obtained / NULLIF(r.max_marks, 0) * 100), 2) AS averagePercentage
       ${joins} ${where} GROUP BY s.id, s.semester_name ORDER BY MIN(s.semester_number), s.id`,
      params
    );
    const [examRows] = await pool.execute(
      `SELECT es.id AS sessionId, es.session_name AS sessionName,
              COUNT(DISTINCT r.usn) AS studentCount, COUNT(*) AS totalResults,
              SUM(CASE WHEN r.status = 'Pass' THEN 1 ELSE 0 END) AS passedResults,
              ROUND(AVG(r.marks_obtained / NULLIF(r.max_marks, 0) * 100), 2) AS averagePercentage
       ${joins} ${where} GROUP BY es.id, es.session_name ORDER BY es.id DESC`,
      params
    );
    const [subjectRows] = await pool.execute(
      `SELECT su.id AS subjectId, su.subject_code AS subjectCode, su.subject_name AS subjectName,
              COUNT(*) AS totalResults,
              SUM(CASE WHEN r.status = 'Pass' THEN 1 ELSE 0 END) AS passedResults,
              SUM(CASE WHEN r.status = 'Fail' THEN 1 ELSE 0 END) AS failedResults,
              ROUND(AVG(r.marks_obtained), 2) AS averageMarks,
              ROUND(AVG(r.marks_obtained / NULLIF(r.max_marks, 0) * 100), 2) AS averagePercentage
       ${joins} ${where} GROUP BY su.id, su.subject_code, su.subject_name ORDER BY su.subject_name`,
      params
    );
    const [topperRows] = await pool.execute(
      `SELECT st.id AS studentId, st.usn, st.name AS studentName, b.batch_name AS batchName,
              COUNT(*) AS resultCount,
              ROUND(AVG(r.marks_obtained / NULLIF(r.max_marks, 0) * 100), 2) AS averagePercentage
       ${joins}
       JOIN students st ON st.usn = r.usn AND st.batch_id = b.id
       ${where} GROUP BY st.id, st.usn, st.name, b.id, b.batch_name
       ORDER BY averagePercentage DESC, st.usn ASC LIMIT 100`,
      params
    );

    const aggregate = aggregateRows[0] || {};
    const inventory = inventoryRows[0] || {};
    const totalResults = numeric(aggregate.totalResults);
    const passedResults = numeric(aggregate.passedResults);
    const failedResults = numeric(aggregate.failedResults);
    const summary = {
      totalStudents: numeric(inventory.totalStudents),
      totalBatches: numeric(inventory.totalBatches),
      totalSemesters: numeric(inventory.totalSemesters),
      totalSubjects: numeric(inventory.totalSubjects),
      totalExamSessions: numeric(inventory.totalExamSessions),
      totalResults,
      resultsAvailable: numeric(aggregate.resultsAvailable),
      passedResults,
      failedResults,
      passedStudents: numeric(aggregate.passedStudents),
      failedStudents: numeric(aggregate.failedStudents),
      overallPassPercentage: percent(passedResults, totalResults),
      overallFailurePercentage: percent(failedResults, totalResults),
      averageMarks: aggregate.averageMarks === null ? 0 : numeric(aggregate.averageMarks),
      highestPercentage: aggregate.highestPercentage === null ? 0 : numeric(aggregate.highestPercentage),
      lowestPercentage: aggregate.lowestPercentage === null ? 0 : numeric(aggregate.lowestPercentage),
      hasData: totalResults > 0
    };
    const exams = examRows.map((row) => ({
      sessionId: row.sessionId,
      sessionName: row.sessionName,
      studentCount: numeric(row.studentCount),
      totalResults: numeric(row.totalResults),
      passPercentage: percent(numeric(row.passedResults), numeric(row.totalResults)),
      averagePercentage: numeric(row.averagePercentage)
    }));
    return {
      summary,
      charts: {
        passFail: { passed: passedResults, failed: failedResults },
        gradeDistribution: gradeRows.map((row) => ({ grade: row.grade, count: numeric(row.resultCount) })),
        semesterPerformance: semesterRows.map((row) => ({
          semesterId: row.semesterId,
          semesterName: row.semesterName,
          resultCount: numeric(row.resultCount),
          passPercentage: percent(numeric(row.passedResults), numeric(row.resultCount)),
          averagePercentage: numeric(row.averagePercentage)
        })),
        examWisePerformance: exams,
        subjectPerformance: subjectRows.map((row) => ({
          subjectId: row.subjectId,
          subjectCode: row.subjectCode,
          subjectName: row.subjectName,
          totalResults: numeric(row.totalResults),
          passedResults: numeric(row.passedResults),
          failedResults: numeric(row.failedResults),
          averageMarks: numeric(row.averageMarks),
          averagePercentage: numeric(row.averagePercentage)
        }))
      },
      topPerformers: rankToppers(topperRows),
      recentExams: exams.slice(0, 6)
    };
  }

  return { getFilterOptions, getDashboardData };
}

const dashboardService = createDashboardService();
module.exports = { ...dashboardService, createDashboardService, buildFilters, rankToppers, EMPTY_DASHBOARD };
