const express = require('express');
const router = express.Router();
const { requireAuth, csrfMiddleware } = require('../middleware/authMiddleware');
const analyticsController = require('../controllers/analyticsController');

// Overview analytics
router.get('/filters', requireAuth, csrfMiddleware, analyticsController.getFilterOptions);
router.get('/overview', requireAuth, csrfMiddleware, analyticsController.getOverview);
// Semester-wise analytics
router.get('/semester', requireAuth, csrfMiddleware, analyticsController.getSemesterAnalytics);
// Subject-wise analytics
router.get('/subject', requireAuth, csrfMiddleware, analyticsController.getSubjectAnalytics);
// Student performance analytics
router.get('/student', requireAuth, csrfMiddleware, analyticsController.getStudentAnalytics);
// Examination analytics
router.get('/examination', requireAuth, csrfMiddleware, analyticsController.getExaminationAnalytics);
// Grade distribution analytics
router.get('/grade-distribution', requireAuth, csrfMiddleware, analyticsController.getGradeDistribution);
// Performance comparison
router.get('/comparison', requireAuth, csrfMiddleware, analyticsController.getPerformanceComparison);

module.exports = router;
