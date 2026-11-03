const dashboardService = require('../services/dashboardService');

exports.getStats = (req, res) => {
  const stats = dashboardService.getDashboardStats();
  res.json({ success: true, data: stats });
};
