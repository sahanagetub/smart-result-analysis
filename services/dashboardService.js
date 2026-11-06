const { getPool, isDbDisabled } = require('../config/db');

function getDashboardStats() {
  const dbAvailable = !isDbDisabled();

  if (!dbAvailable) {
    return {
      dbAvailable: false,
      totalStudents: null,
      totalBatches: null,
      totalSubjects: null,
      totalSemesters: null,
      totalResults: null
    };
  }

  return {
    dbAvailable: true,
    demoData: false,
    totalStudents: null,
    totalBatches: null,
    totalSubjects: null,
    totalSemesters: null,
    totalResults: null
  };
}

async function getDashboardStatsAsync() {
  const dbAvailable = !isDbDisabled();
  if (!dbAvailable) {
    return {
      dbAvailable: false,
      totalStudents: null,
      totalBatches: null,
      totalSubjects: null,
      totalSemesters: null,
      totalResults: null
    };
  }
  const pool = getPool();
  if (!pool) {
    return {
      dbAvailable: true,
      demoData: false,
      totalStudents: null,
      totalBatches: null,
      totalSubjects: null,
      totalSemesters: null,
      totalResults: null
    };
  }
  try {
    const [students] = await pool.execute('SELECT COUNT(*) AS cnt FROM students');
    const [batches] = await pool.execute('SELECT COUNT(*) AS cnt FROM batches');
    const [subjects] = await pool.execute('SELECT COUNT(*) AS cnt FROM subjects');
    const [semesters] = await pool.execute('SELECT COUNT(*) AS cnt FROM semesters');
    const [results] = await pool.execute('SELECT COUNT(*) AS cnt FROM results');
    return {
      dbAvailable: true,
      demoData: false,
      totalStudents: Number(students[0].cnt),
      totalBatches: Number(batches[0].cnt),
      totalSubjects: Number(subjects[0].cnt),
      totalSemesters: Number(semesters[0].cnt),
      totalResults: Number(results[0].cnt)
    };
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    return {
      dbAvailable: true,
      demoData: false,
      totalStudents: null,
      totalBatches: null,
      totalSubjects: null,
      totalSemesters: null,
      totalResults: null
    };
  }
}

function getRecentActivity() {
  return [
    { message: 'System initialized.', time: 'Just now' }
  ];
}

module.exports = { getDashboardStats, getDashboardStatsAsync, getRecentActivity };