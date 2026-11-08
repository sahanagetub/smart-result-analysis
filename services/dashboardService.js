const { getPool, isDbDisabled } = require('../config/db');

/**
 * Get dashboard summary statistics from the database.
 * Returns: totalStudents, resultsAvailable, passedStudents, failedStudents,
 *          overallPassPercentage, totalSubjects
 */
async function getDashboardSummaryAsync() {
  const dbAvailable = !isDbDisabled();
  if (!dbAvailable) {
    return {
      dbAvailable: false,
      totalStudents: 0,
      resultsAvailable: 0,
      passedStudents: 0,
      failedStudents: 0,
      overallPassPercentage: 0,
      totalSubjects: 0,
    };
  }

  const pool = getPool();
  if (!pool) {
    return {
      dbAvailable: true,
      demoData: false,
      totalStudents: 0,
      resultsAvailable: 0,
      passedStudents: 0,
      failedStudents: 0,
      overallPassPercentage: 0,
      totalSubjects: 0,
    };
  }

  try {
    // Total number of students
    const [students] = await pool.execute('SELECT COUNT(*) AS cnt FROM students');
    totalStudents = Number(students[0].cnt);

    // Total students having available results (distinct students with results)
    const [resultsAvailableRows] = await pool.execute(
      'SELECT COUNT(DISTINCT usn) AS cnt FROM results'
    );
    resultsAvailable = Number(resultsAvailableRows[0].cnt);

    // Number of passed students (distinct students with at least one Pass result)
    const [passedRows] = await pool.execute(
      "SELECT COUNT(DISTINCT usn) AS cnt FROM results WHERE status = 'Pass'"
    );
    passedStudents = Number(passedRows[0].cnt);

    // Number of failed students (distinct students with at least one Fail result)
    const [failedRows] = await pool.execute(
      "SELECT COUNT(DISTINCT usn) AS cnt FROM results WHERE status = 'Fail'"
    );
    failedStudents = Number(failedRows[0].cnt);

    // Total number of subjects
    const [subjects] = await pool.execute('SELECT COUNT(*) AS cnt FROM subjects');
    totalSubjects = Number(subjects[0].cnt);

    // Overall pass percentage - avoid division by zero
    let overallPassPercentage = 0;
    if (resultsAvailable > 0) {
      overallPassPercentage = Math.round((passedStudents / resultsAvailable) * 100);
    }

    return {
      dbAvailable: true,
      demoData: false,
      totalStudents,
      resultsAvailable,
      passedStudents,
      failedStudents,
      overallPassPercentage,
      totalSubjects,
    };
  } catch (err) {
    console.error('Dashboard summary async error:', err.message);
    return {
      dbAvailable: true,
      demoData: false,
      totalStudents: 0,
      resultsAvailable: 0,
      passedStudents: 0,
      failedStudents: 0,
      overallPassPercentage: 0,
      totalSubjects: 0,
    };
  }
}

/**
 * Get subject-wise average marks from the database.
 * Returns array of objects with subjectCode, subjectName, avgMarks.
 */
async function getSubjectPerformanceAsync() {
  const dbAvailable = !isDbDisabled();
  if (!dbAvailable) {
    return {
      dbAvailable: false,
      demoData: false,
      subjectPerformance: [],
    };
  }

  const pool = getPool();
  if (!pool) {
    return {
      dbAvailable: true,
      demoData: false,
      subjectPerformance: [],
    };
  }

  try {
    const [rows] = await pool.execute(
      `SELECT s.subject_code, s.subject_name, 
           ROUND(AVG(r.marks_obtained), 2) AS avg_marks
        FROM subjects s
        JOIN results r ON r.subject_code = s.subject_code
        GROUP BY s.subject_code, s.subject_name
        ORDER BY s.subject_name`
    );

    const subjectPerformance = rows.map((row) => ({
      subjectCode: row.subject_code,
      subjectName: row.subject_name,
      avgMarks: row.avg_marks,
    }));

    // If no results exist but subjects exist, return subjects with 0 avg marks
    if (subjectPerformance.length === 0) {
      // Check if there are subjects without results
      const [subjectRows] = await pool.execute(
        'SELECT subject_code, subject_name FROM subjects'
      );
      if (subjectRows.length > 0) {
        subjectPerformance = subjectRows.map((row) => ({
          subjectCode: row.subject_code,
          subjectName: row.subject_name,
          avgMarks: 0,
        }));
      }
    }

    return {
      dbAvailable: true,
      demoData: false,
      subjectPerformance,
    };
  } catch (err) {
    console.error('Dashboard subject performance async error:', err.message);
    return {
      dbAvailable: true,
      demoData: false,
      subjectPerformance: [],
    };
  }
}

module.exports = {
  getDashboardSummaryAsync,
  getSubjectPerformanceAsync,
};