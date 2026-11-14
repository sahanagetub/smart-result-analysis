const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

// Overview analytics
router.get('/overview', requireAuth, analyticsController.getOverview);
router.get('/class', requireAuth, analyticsController.getClassAnalysis);
router.get('/subjects', requireAuth, analyticsController.getSubjectAnalysis);
router.get('/toppers', requireAuth, analyticsController.getToppers);

module.exports = router;
