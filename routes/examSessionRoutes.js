const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireStaff, csrfMiddleware } = require('../middleware/authMiddleware');
const examSessionController = require('../controllers/examSessionController');

router.use(requireAuth, requireAdmin);

// POST create exam session
router.post('/', requireAuth, requireStaff, csrfMiddleware, examSessionController.createExamSession);

// GET get all exam sessions
router.get('/', requireAuth, csrfMiddleware, examSessionController.getAllExamSessions);

// GET get exam sessions by semester
router.get('/semester/:semesterId', requireAuth, csrfMiddleware, examSessionController.getExamSessionsBySemester);

// GET exam session statistics (must come before /:id)
router.get('/stats', requireAuth, csrfMiddleware, examSessionController.getExamSessionStats);

// GET get single exam session
router.get('/:id', requireAuth, csrfMiddleware, examSessionController.getExamSessionById);

// PUT update exam session
router.put('/:id', requireAuth, requireStaff, csrfMiddleware, examSessionController.updateExamSession);

// DELETE delete exam session
router.delete('/:id', requireAuth, requireStaff, csrfMiddleware, examSessionController.deleteExamSession);

// PATCH update exam session status
router.patch('/:id/status', requireAuth, requireStaff, csrfMiddleware, examSessionController.updateExamSessionStatus);

module.exports = router;
