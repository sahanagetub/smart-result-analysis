const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireStaff } = require('../middleware/authMiddleware');
const path = require('path');

router.get('/', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/dashboard');
  return res.redirect('/login');
});

// Helper: redirect unauthenticated to login
function guestOnly(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

// Login page (guest only)
router.get('/login', guestOnly, (req, res) => {
  res.redirect('/login.html');
});

// Dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard/index', { title: 'Dashboard', active: 'dashboard' });
});

// Batches
router.get('/batches', requireAuth, (req, res) => {
  res.render('batches/index', { title: 'Batch Management', active: 'batches' });
});

router.get('/batches/:id', requireAuth, (req, res) => {
  res.render('batches/view', { title: 'Batch Details', active: 'batches', batchId: req.params.id });
});

// Students
router.get('/students', requireAuth, (req, res) => {
  res.render('students/index', { title: 'Student Management', active: 'students', batchId: req.query.batchId || '' });
});

// Semesters
router.get('/semesters', requireAuth, (req, res) => {
  res.render('semesters/index', { title: 'Semester Management', active: 'semesters' });
});

// Exam Sessions
router.get('/sessions', requireAuth, (req, res) => {
  res.render('sessions/index', { title: 'Exam Sessions', active: 'sessions' });
});

// Subjects
router.get('/subjects', requireAuth, (req, res) => {
  res.render('subjects/index', { title: 'Subjects', active: 'subjects' });
});

// Results
router.get('/results', requireAuth, (req, res) => {
  res.render('results/index', { title: 'Result Records', active: 'results' });
});

router.get('/results/upload', requireAuth, requireStaff, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'result-upload.html'));
});

router.get('/results/extract', requireAuth, requireStaff, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'result-extraction.html'));
});

// Test data generator (admin only)
router.get('/generator', requireAuth, requireAdmin, (req, res) => {
  res.render('generator/index', {
    title: 'Test Data Generator',
    active: 'generator',
    csrfToken: req.session && req.session._csrf
  });
});

// Analytics
router.get('/analytics', requireAuth, (req, res) => {
  res.render('analytics/index', { title: 'Analytics', active: 'analytics' });
});

// Reports
router.get('/reports', requireAuth, (req, res) => {
  res.render('reports/index', { title: 'Reports', active: 'reports' });
});

module.exports = router;
