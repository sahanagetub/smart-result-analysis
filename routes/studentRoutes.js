const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
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

// GET students for a specific batch
router.get('/batch/:batchId', requireAuth, studentController.listStudents);

// GET single student
router.get('/:id', requireAuth, studentController.getStudent);

// POST add student
router.post('/', requireAuth, studentValidation, handleValidation, studentController.addStudent);

// PUT update student
router.put('/:id', requireAuth, studentController.updateStudent);

// DELETE delete student
router.delete('/:id', requireAuth, studentController.deleteStudent);

// POST import students (upload + parse + validate → preview)
router.post('/import', requireAuth, upload.single('importFile'), studentController.importStudents);

// POST confirm import (save validated students)
router.post('/import/confirm', requireAuth, studentController.confirmImportStudents);

module.exports = router;