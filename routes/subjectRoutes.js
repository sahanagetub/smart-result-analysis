const express = require('express');
const router = express.Router();
const { requireAuth, requireStaff } = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');
const subjectController = require('../controllers/subjectController');

const subjectValidation = [
  body('subject_code').trim().notEmpty().withMessage('Subject code is required.').escape(),
  body('subject_name').trim().notEmpty().withMessage('Subject name is required.').escape(),
  body('semester_id').isInt({ min: 1 }).withMessage('Valid semester is required.'),
  body('credits').isInt({ min: 1, max: 10 }).withMessage('Credits must be between 1 and 10.'),
  body('max_internal_marks').isInt({ min: 0, max: 100 }).withMessage('Max internal marks must be between 0 and 100.'),
  body('max_external_marks').isInt({ min: 0, max: 100 }).withMessage('Max external marks must be between 0 and 100.'),
  body('total_maximum_marks').isInt({ min: 0, max: 200 }).withMessage('Total maximum marks must be between 0 and 200.')
];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

router.get('/', requireAuth, subjectController.getAllSubjects);
router.get('/semester/:semesterId', requireAuth, subjectController.getSubjectsBySemester);
router.get('/:id', requireAuth, subjectController.getSubjectById);
router.post('/', requireAuth, requireStaff, subjectValidation, handleValidation, subjectController.createSubject);
router.put('/:id', requireAuth, requireStaff, subjectValidation, handleValidation, subjectController.updateSubject);
router.delete('/:id', requireAuth, requireStaff, subjectController.deleteSubject);

module.exports = router;