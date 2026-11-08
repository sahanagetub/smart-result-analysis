const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

router.get('/analytics/summary', requireAuth, analyticsController.getAnalyticsSummary);
router.get('/analytics/pass-fail', requireAuth, analyticsController.getPassFailStats);
router.get('/analytics/subject-performance', requireAuth, analyticsController.getSubjectPerformance);
router.get('/api/rankings', requireAuth, analyticsController.getStudentRanking);
router.get('/api/rankings/top-ten', requireAuth, analyticsController.getTopTenStudents);
router.get('/api/results/student/:usn', requireAuth, analyticsController.getStudentResult);
router.get('/api/reports/summary', requireAuth, analyticsController.getAnalyticsSummary);
router.get('/api/reports/toppers', requireAuth, analyticsController.getTopTenStudents);

module.exports = router;