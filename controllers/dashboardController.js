const dashboardService = require('../services/dashboardService');

exports.getStats = (req, res) => {
  const stats = dashboardService.getDashboardStats();
  const recentActivity = dashboardService.getRecentActivity();
  res.json({ success: true, data: { stats, recentActivity } });
};
