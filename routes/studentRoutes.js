const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');
const studentController = require('../controllers/studentController');

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

module.exports = router;