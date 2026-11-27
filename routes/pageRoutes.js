const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

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

router.get('/change-password', requireAuth, (req, res) => {
  if (!req.user.mustChangePassword) return res.redirect('/dashboard');
  res.render('auth/first-login-password', { title: 'Set Your Password', active: 'dashboard' });
});

// Dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard/index', { title: 'Dashboard', active: 'dashboard' });
});

// Batches
router.get('/batches', requireAuth, requireAdmin, (req, res) => {
  res.render('batches/index', { title: 'Batch Management', active: 'batches' });
});

router.get('/batches/:id', requireAuth, requireAdmin, (req, res) => {
  res.render('batches/view', { title: 'Batch Details', active: 'batches', batchId: req.params.id });
});

// Students
router.get('/students', requireAuth, requireAdmin, (req, res) => {
  res.render('students/index', { title: 'Student Management', active: 'students', batchId: req.query.batchId || '' });
});

// Semesters
router.get('/semesters', requireAuth, requireAdmin, (req, res) => {
  res.render('semesters/index', { title: 'Semester Management', active: 'semesters' });
});

// Exam Sessions
router.get('/sessions', requireAuth, requireAdmin, (req, res) => {
  res.render('sessions/index', { title: 'Exam Sessions', active: 'sessions' });
});

// Subjects
router.get('/subjects', requireAuth, requireAdmin, (req, res) => {
  res.render('subjects/index', { title: 'Subjects', active: 'subjects' });
});

// Results
router.get('/results', requireAuth, (req, res) => {
  res.render('results/index', { title: 'Result Records', active: 'results' });
});

router.get('/results/upload', requireAuth, requireAdmin, (req, res) => {
  res.redirect('/results/extract');
});

router.get('/results/extract', requireAuth, requireAdmin, (_req, res) => {
  res.render('results/extract', { title: 'Upload Results', active: 'resultUpload' });
});

router.get('/results/extract/confirm', requireAuth, requireAdmin, (_req, res) => {
  res.render('results/extract-confirm', { title: 'Confirm Results', active: 'resultUpload' });
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
