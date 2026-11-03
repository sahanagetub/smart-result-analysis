const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

router.get('/stats', requireAuth, dashboardController.getStats);

module.exports = router;
