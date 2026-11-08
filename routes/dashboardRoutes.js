const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

router.get('/stats', requireAuth, dashboardController.getStats);
router.get('/summary', requireAuth, dashboardController.getSummary);
router.get('/subject-performance', requireAuth, dashboardController.getSubjectPerformance);
router.get('/top-performers', requireAuth, dashboardController.getTopPerformers);
router.get('/subject-averages', requireAuth, dashboardController.getSubjectAverages);
router.get('/overall-performance', requireAuth, dashboardController.getOverallPerformance);
router.get('/result-distribution', requireAuth, dashboardController.getResultDistribution);
router.get('/subject-pass-fail', requireAuth, dashboardController.getSubjectPassFail);

module.exports = router;
