const { isDbDisabled } = require('../config/db');

// Provides dashboard statistics.
// When MySQL is disabled, no fake statistics are returned; the dashboard
// shows a demo-state message instead of presenting sample values as records.
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

  // Sample values used only as demonstration data when DB is enabled but
  // real tables are not yet implemented. Clearly marked as demo.
  return {
    dbAvailable: true,
    demoData: true,
    totalStudents: 120,
    totalBatches: 6,
    totalSubjects: 24,
    totalSemesters: 4,
    totalResults: 480
  };
}

function getRecentActivity() {
  return [
    { message: 'New batch "MCA 2024-26" created (sample)', time: '2 hours ago' },
    { message: 'Student records updated for Semester 3 (sample)', time: '5 hours ago' },
    { message: 'Result records imported (sample)', time: '1 day ago' },
    { message: 'Subject list reviewed (sample)', time: '2 days ago' }
  ];
}

module.exports = { getDashboardStats, getRecentActivity };
