const express = require('express');
const router = express.Router();

router.use('/api/auth', require('./authRoutes'));
router.use('/api/dashboard', require('./dashboardRoutes'));
router.use('/api/analytics', require('./analyticsRoutes'));
router.use('/api/reports', require('./reportRoutes'));
router.use('/api/batches', require('./batchRoutes'));
router.use('/api/students', require('./studentRoutes'));
router.use('/api/semesters', require('./semesterRoutes'));
router.use('/api/exam-sessions', require('./examSessionRoutes'));
router.use('/api/subjects', require('./subjectRoutes'));
router.use('/api/results', require('./resultRoutes'));
router.use('/api/result-uploads', require('./resultUploadRoutes'));
router.use('/api/result-extractions', require('./resultExtractionRoutes'));
router.use('/api/generator', require('./generatorRoutes'));
router.use('/', require('./healthRoutes'));

module.exports = router;
