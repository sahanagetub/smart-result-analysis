const express = require('express');
const router = express.Router();
const { requireAuth, requireStaff } = require('../middleware/authMiddleware');
const examSessionController = require('../controllers/examSessionController');

// POST create exam session
router.post('/', requireAuth, requireStaff, examSessionController.createExamSession);

// GET get all exam sessions
router.get('/', requireAuth, examSessionController.getAllExamSessions);

// GET get exam sessions by semester
router.get('/semester/:semesterId', requireAuth, examSessionController.getExamSessionsBySemester);

// GET get single exam session
router.get('/:id', requireAuth, examSessionController.getExamSessionById);

// PUT update exam session
router.put('/:id', requireAuth, requireStaff, examSessionController.updateExamSession);

// DELETE delete exam session
router.delete('/:id', requireAuth, requireStaff, examSessionController.deleteExamSession);

// PATCH update exam session status
router.patch('/:id/status', requireAuth, requireStaff, examSessionController.updateExamSessionStatus);

// GET exam session statistics
router.get('/stats', requireAuth, examSessionController.getExamSessionStats);

module.exports = router;
