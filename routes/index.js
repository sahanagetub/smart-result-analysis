const express = require('express');
const router = express.Router();

router.use('/api/auth', require('./authRoutes'));
router.use('/api/dashboard', require('./dashboardRoutes'));
router.use('/api/batches', require('./batchRoutes'));
router.use('/api/students', require('./studentRoutes'));
router.use('/api/semesters', require('./semesterRoutes'));
router.use('/api/exam-sessions', require('./examSessionRoutes'));
router.use('/api/subjects', require('./subjectRoutes'));
router.use('/api/results', require('./resultRoutes'));
router.use('/', require('./healthRoutes'));

// Root redirect to EJS page router (handles /login, /dashboard, etc.)
router.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

module.exports = router;
