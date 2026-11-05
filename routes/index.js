const express = require('express');
const router = express.Router();

router.use('/api/auth', require('./authRoutes'));
router.use('/api/dashboard', require('./dashboardRoutes'));
router.use('/api/batches', require('./batchRoutes'));
router.use('/api/students', require('./studentRoutes'));
router.use('/api/semesters', require('./semesterRoutes'));
router.use('/api/exam-sessions', require('./examSessionRoutes'));
router.use('/', require('./healthRoutes'));

router.get('/', (req, res) => res.redirect('/dashboard.html'));

module.exports = router;
