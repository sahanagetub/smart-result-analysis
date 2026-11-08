const resultService = require('../services/resultService');
const { getPool, isDbDisabled } = require('../config/db');

/**
 * GET /api/dashboard/summary
 * Returns dashboard summary statistics calculated from the database.
 */
exports.getSummary = async (req, res) => {
  try {
    const dbAvailable = !isDbDisabled();
    let pool = null;

    if (dbAvailable) {
      pool = getPool();
      if (!pool) dbAvailable = false;
    }

    let totalStudents = 0;
    let resultsAvailable = 0;
    let passedStudents = 0;
    let failedStudents = 0;
    let overallPassPercentage = 0;
    let totalSubjects = 0;
    let dbAvailableFlag = false;

    if (dbAvailable && pool) {
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
        if (resultsAvailable > 0) {
          overallPassPercentage = Math.round((passedStudents / resultsAvailable) * 100);
        } else {
          overallPassPercentage = 0;
        }

        dbAvailableFlag = true;
      } catch (err) {
        console.error('Dashboard summary DB error:', err.message);
      }
    }

    const summary = {
      totalStudents,
      resultsAvailable,
      passedStudents,
      failedStudents,
      overallPassPercentage,
      totalSubjects,
    };

    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('Dashboard summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
/**
 * GET /api/dashboard/subject-performance
 * Returns subject-wise average marks from the database.
 */
exports.getSubjectPerformance = async (req, res) => {
  try {
    const dbAvailable = !isDbDisabled();
    let pool = null;

    if (dbAvailable) {
      pool = getPool();
      if (!pool) dbAvailable = false;
    }

    let subjectPerformance = [];

    if (dbAvailable && pool) {
      try {
        const [rows] = await pool.execute(
          `SELECT s.subject_code, s.subject_name, 
                   ROUND(AVG(r.marks_obtained), 2) AS avg_marks
            FROM subjects s
            JOIN results r ON r.subject_code = s.subject_code
            GROUP BY s.subject_code, s.subject_name
            ORDER BY s.subject_name`
        );

        subjectPerformance = rows.map((row) => ({
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
          subjectPerformance = subjectRows.map((row) => ({
            subjectCode: row.subject_code,
            subjectName: row.subject_name,
            avgMarks: 0,
          }));
        }
      } catch (err) {
        console.error('Dashboard subject performance DB error:', err.message);
      }
    }

    res.json({ success: true, data: subjectPerformance });
  } catch (err) {
    console.error('Dashboard subject performance error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/dashboard/top-performers
 * Returns top 10 students by overall average percentage.
 */
exports.getTopPerformers = async (req, res) => {
  try {
    const dbAvailable = !isDbDisabled();
    let pool = null;

    if (dbAvailable) {
      pool = getPool();
      if (!pool) dbAvailable = false;
    }

    let topPerformers = [];

    if (dbAvailable && pool) {
      try {
        const [rows] = await pool.execute(
          `SELECT r.usn, s.name, s.batch_id, 
                   ROUND(AVG(r.marks_obtained / r.max_marks * 100), 2) AS avg_percentage,
                   COUNT(DISTINCT r.subject_code) AS subjects_count
           FROM results r
           JOIN students s ON r.usn = s.usn
           WHERE r.status IS NOT NULL
           GROUP BY r.usn, s.name, s.batch_id
           HAVING subjects_count >= 1
           ORDER BY avg_percentage DESC
           LIMIT 10`
        );

        topPerformers = rows.map((row, index) => ({
          rank: index + 1,
          usn: row.usn,
          name: row.name,
          batchId: row.batch_id,
          averagePercentage: row.avg_percentage
        }));
      } catch (err) {
        console.error('Dashboard top performers DB error:', err.message);
      }
    }

    res.json({ success: true, data: topPerformers });
  } catch (err) {
    console.error('Dashboard top performers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
/**
 * GET /api/dashboard/subject-averages
 * Returns subject-wise average marks with max marks and student count.
 */
exports.getSubjectAverages = async (req, res) => {
  try {
    const dbAvailable = !isDbDisabled();
    let pool = null;

    if (dbAvailable) {
      pool = getPool();
      if (!pool) dbAvailable = false;
    }

    let subjectAverages = [];

    if (dbAvailable && pool) {
      try {
        const [rows] = await pool.execute(
          `SELECT s.subject_code, s.subject_name, 
                  ROUND(AVG(r.marks_obtained), 2) AS avg_marks,
                  MAX(r.max_marks) AS max_marks,
                  COUNT(DISTINCT r.usn) AS students_appeared
           FROM subjects s
           LEFT JOIN results r ON r.subject_code = s.subject_code
           GROUP BY s.subject_code, s.subject_name
           ORDER BY s.subject_name`
        );

        subjectAverages = rows.map((row) => ({
          subjectCode: row.subject_code,
          subjectName: row.subject_name,
/**
 * GET /api/dashboard/result-distribution
 * Returns the number of students in each percentage range.
 */
exports.getResultDistribution = async (req, res) => {
  try {
    const dbAvailable = !isDbDisabled();
    let pool = null;

    if (dbAvailable) {
      pool = getPool();
      if (!pool) dbAvailable = false;
    }

    let distribution = {
      '90-100': 0,
      '80-89': 0,
      '70-79': 0,
      '60-69': 0,
      'below-60': 0
    };

    if (dbAvailable && pool) {
      try {
        const [rows] = await pool.execute(
          `SELECT 
              CASE 
                WHEN (marks_obtained / max_marks * 100) >= 90 THEN '90-100'
                WHEN (marks_obtained / max_marks * 100) >= 80 THEN '80-89'
                WHEN (marks_obtained / max_marks * 100) >= 70 THEN '70-79'
                WHEN (marks_obtained / max_marks * 100) >= 60 THEN '60-69'
                ELSE 'below-60'
              END AS range,
              COUNT(DISTINCT usn) AS student_count
            FROM results
            WHERE marks_obtained IS NOT NULL AND marks_obtained > 0
            GROUP BY range`
        );

        rows.forEach((row) => {
          if (distribution.hasOwnProperty(row.range)) {
            distribution[row.range] = row.student_count;
          }
        });
      } catch (err) {
        console.error('Dashboard result distribution DB error:', err.message);
      }
    }

    res.json({ success: true, data: distribution });
  } catch (err) {
    console.error('Dashboard result distribution error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/dashboard/subject-pass-fail
 * Returns subject-wise pass/fail analysis.
 */
exports.getSubjectPassFail = async (req, res) => {
  try {
    const dbAvailable = !isDbDisabled();
    let pool = null;

    if (dbAvailable) {
      pool = getPool();
      if (!pool) dbAvailable = false;
    }

    let subjectPassFail = [];

    if (dbAvailable && pool) {
      try {
        const [rows] = await pool.execute(
          `SELECT s.subject_code, s.subject_name,
                  SUM(CASE WHEN r.status = 'Pass' THEN 1 ELSE 0 END) AS passed,
                  SUM(CASE WHEN r.status = 'Fail' THEN 1 ELSE 0 END) AS failed,
                  COUNT(DISTINCT r.usn) AS total_appeared
           FROM subjects s
           LEFT JOIN results r ON r.subject_code = s.subject_code
           GROUP BY s.subject_code, s.subject_name
           ORDER BY s.subject_name`
        );

        subjectPassFail = rows.map((row) => ({
          subjectCode: row.subject_code,
          subjectName: row.subject_name,
          passed: row.passed > 0 ? row.passed : 0,
          failed: row.failed > 0 ? row.failed : 0,
          totalAppeared: row.total_appeared > 0 ? row.total_appeared : 0
        }));

        // If no results exist but subjects exist, return subjects with 0 values
        if (subjectPassFail.length === 0) {
          const [subjectRows] = await pool.execute(
            'SELECT subject_code, subject_name FROM subjects'
          );
          subjectPassFail = subjectRows.map((row) => ({
            subjectCode: row.subject_code,
            subjectName: row.subject_name,
            passed: 0,
            failed: 0,
            totalAppeared: 0
          }));
        }
      } catch (err) {
        console.error('Dashboard subject pass/fail DB error:', err.message);
      }
    }

    res.json({ success: true, data: subjectPassFail });
  } catch (err) {
    console.error('Dashboard subject pass/fail error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
          avgMarks: row.avg_marks !== null ? row.avg_marks : 0,
          maxMarks: row.max_marks !== null ? row.max_marks : 0,
          studentsAppeared: row.students_appeared !== null ? row.students_appeared : 0
        }));

        // If no results exist but subjects exist, return subjects with 0 values
        if (subjectAverages.length === 0) {
          const [subjectRows] = await pool.execute(
            'SELECT subject_code, subject_name FROM subjects'
          );
          subjectAverages = subjectRows.map((row) => ({
            subjectCode: row.subject_code,
            subjectName: row.subject_name,
            avgMarks: 0,
            maxMarks: 0,
            studentsAppeared: 0
          }));
        }
      } catch (err) {
        console.error('Dashboard subject averages DB error:', err.message);
      }
    }

    res.json({ success: true, data: subjectAverages });
  } catch (err) {
    console.error('Dashboard subject averages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/dashboard/overall-performance
 * Returns overall class performance statistics.
 */
exports.getOverallPerformance = async (req, res) => {
  try {
    const dbAvailable = !isDbDisabled();
    let pool = null;

    if (dbAvailable) {
      pool = getPool();
      if (!pool) dbAvailable = false;
    }

    let overallPerformance = {
      totalAppeared: 0,
      overallAverage: 0,
      highestPercentage: 0,
      lowestPercentage: 100
    };

    if (dbAvailable && pool) {
      try {
        // Total students who have at least one result
        const [appeared] = await pool.execute(
          `SELECT COUNT(DISTINCT usn) AS cnt FROM results WHERE marks_obtained IS NOT NULL AND marks_obtained > 0`
        );
        overallPerformance.totalAppeared = appeared[0].cnt > 0 ? Number(appeared[0].cnt) : 0;

        // Overall average marks
        const [avg] = await pool.execute(
          `SELECT AVG(marks_obtained) AS avg FROM results WHERE marks_obtained IS NOT NULL AND marks_obtained > 0`
        );
        if (avg[0].avg !== null) {
          overallPerformance.overallAverage = Math.round(Number(avg[0].avg) * 100) / 100;
        }

        // Highest percentage
        const [highest] = await pool.execute(
          `SELECT MAX(marks_obtained / max_marks * 100) AS max_pct FROM results WHERE marks_obtained IS NOT NULL AND marks_obtained > 0`
        );
        if (highest[0].max_pct !== null) {
          overallPerformance.highestPercentage = Math.round(Number(highest[0].max_pct) * 100) / 100;
        }

        // Lowest percentage (excluding zeros)
        const [lowest] = await pool.execute(
          `SELECT MIN(marks_obtained / max_marks * 100) AS min_pct FROM results WHERE marks_obtained IS NOT NULL AND marks_obtained > 0 AND marks_obtained > 0`
        );
        if (lowest[0].min_pct !== null) {
          overallPerformance.lowestPercentage = Math.round(Number(lowest[0].min_pct) * 100) / 100;
        }
      } catch (err) {
        console.error('Dashboard overall performance DB error:', err.message);
      }
    }

    res.json({ success: true, data: overallPerformance });
  } catch (err) {
    console.error('Dashboard overall performance error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};