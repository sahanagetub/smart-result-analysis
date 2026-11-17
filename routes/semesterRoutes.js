const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireStaff, csrfMiddleware } = require('../middleware/authMiddleware');
const semesterController = require('../controllers/semesterController');

// GET all semesters (supports ?batchId=, ?search=, ?status=)
router.get('/', requireAuth, semesterController.getAllSemesters);

// GET all semesters for a batch
router.get('/batch/:batchId', requireAuth, semesterController.getSemestersByBatch);

// GET single semester
router.get('/:id', requireAuth, semesterController.getSemesterById);

// POST create semester (clerk/admin only)
router.post('/', requireAuth, requireStaff, csrfMiddleware, semesterController.createSemester);

// PUT update semester
router.put('/:id', requireAuth, requireStaff, csrfMiddleware, semesterController.updateSemester);

// DELETE semester
router.delete('/:id', requireAuth, requireStaff, csrfMiddleware, semesterController.deleteSemester);

module.exports = router;