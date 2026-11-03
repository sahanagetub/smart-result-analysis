// Provides sample (static) dashboard statistics.
// Database integration will replace these values in a later phase.
function getDashboardStats() {
  return {
    totalStudents: 120,
    totalBatches: 6,
    totalSubjects: 24,
    totalResults: 480
  };
}

module.exports = { getDashboardStats };
