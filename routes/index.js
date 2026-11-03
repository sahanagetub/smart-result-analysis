const express = require('express');
const router = express.Router();

router.use('/api/auth', require('./authRoutes'));
router.use('/api/dashboard', require('./dashboardRoutes'));
router.use('/', require('./healthRoutes'));

router.get('/', (req, res) => res.redirect('/dashboard.html'));

module.exports = router;
