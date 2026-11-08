const express = require('express');
const router = express.Router();
const { requireAuth, requireStaff } = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');
const resultController = require('../controllers/resultController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const resultValidation = [
  body('usn').trim().notEmpty().withMessage('USN is required.'),
  body('subject_code').trim().notEmpty().withMessage('Subject code is required.'),
  body('subject_name').trim().notEmpty().withMessage('Subject name is required.'),
  body('marks_obtained').isNumeric().withMessage('Valid marks obtained required.'),
  body('max_marks').isNumeric().withMessage('Valid max marks required.'),
  body('exam_session_id').isInt({ min: 1 }).withMessage('Valid exam session required.')
];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

router.get('/', requireAuth, resultController.getAllResults);
router.get('/stats', requireAuth, resultController.getResultStats);
router.get('/session/:examSessionId', requireAuth, resultController.getResultsByExamSession);
router.post('/', requireAuth, requireStaff, resultValidation, handleValidation, resultController.createResult);

// Upload Result - DISABLED: No PDF extraction, file parsing, OCR, or actual result uploading
// Feature to be implemented in Phase 8 second half
router.delete('/:id', requireAuth, requireStaff, resultController.deleteResult);

module.exports = router;