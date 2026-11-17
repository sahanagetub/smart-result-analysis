const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

router.get('/stats', requireAuth, dashboardController.validateFilters, dashboardController.getStats);
router.get('/filter-options', requireAuth, dashboardController.getFilterOptions);
router.get('/data', requireAuth, dashboardController.validateFilters, dashboardController.getDashboardData);
router.get('/recent-exams', requireAuth, dashboardController.validateFilters, dashboardController.getRecentExams);
router.get('/summary', requireAuth, dashboardController.validateFilters, dashboardController.getSummary);
router.get('/subject-performance', requireAuth, dashboardController.validateFilters, dashboardController.getSubjectPerformance);
router.get('/top-performers', requireAuth, dashboardController.validateFilters, dashboardController.getTopPerformers);
router.get('/subject-averages', requireAuth, dashboardController.validateFilters, dashboardController.getSubjectAverages);
router.get('/overall-performance', requireAuth, dashboardController.validateFilters, dashboardController.getOverallPerformance);
router.get('/result-distribution', requireAuth, dashboardController.validateFilters, dashboardController.getResultDistribution);
router.get('/subject-pass-fail', requireAuth, dashboardController.validateFilters, dashboardController.getSubjectPassFail);

module.exports = router;
