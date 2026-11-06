const dashboardService = require('../services/dashboardService');

exports.getStats = async (req, res) => {
  const stats = await dashboardService.getDashboardStatsAsync();
  const recentActivity = dashboardService.getRecentActivity();
  res.json({ success: true, data: { stats, recentActivity } });
};
