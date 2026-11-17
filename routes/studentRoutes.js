const express = require('express');
const router = express.Router();
const { requireAuth, csrfMiddleware } = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const studentController = require('../controllers/studentController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const studentValidation = [
  body('usn').trim().notEmpty().withMessage('USN is required.').isLength({ max: 20 }).escape(),
  body('name').trim().notEmpty().withMessage('Student name is required.').isLength({ max: 100 }),
  body('email').trim().notEmpty().withMessage('Email is required.').isEmail().normalizeEmail(),
  body('batch_id').isInt({ min: 1 }).withMessage('Valid batch ID is required.')
];

const searchValidation = [
  body('search').optional().trim().isLength({ max: 100 })
];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

// GET all students (supports ?batchId= or ?search=)
router.get('/', requireAuth, studentController.listStudents);

// GET students for a specific batch
router.get('/batch/:batchId', requireAuth, studentController.listStudents);

// GET single student
router.get('/:id', requireAuth, studentController.getStudent);

// POST add student
router.post('/', requireAuth, csrfMiddleware, studentValidation, handleValidation, studentController.addStudent);

// PUT update student
router.put('/:id', requireAuth, csrfMiddleware, studentController.updateStudent);

// DELETE delete student
router.delete('/:id', requireAuth, csrfMiddleware, studentController.deleteStudent);

// POST import students (upload + parse + validate → preview)
router.post('/import', requireAuth, csrfMiddleware, upload.single('importFile'), studentController.importStudents);

// POST confirm import (save validated students)
router.post('/import/confirm', requireAuth, csrfMiddleware, studentController.confirmImportStudents);

module.exports = router;