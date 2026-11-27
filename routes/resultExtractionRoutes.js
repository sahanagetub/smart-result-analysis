'use strict';

const multer = require('multer');
const { requireAuth, requireStaff, csrfMiddleware } = require('../middleware/authMiddleware');
const controller = require('../controllers/resultExtractionController');

const router = require('express').Router();
let activeExtractions = 0;
const MAX_CONCURRENT_EXTRACTIONS = 3;
const receivePdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 3 }
}).fields([{ name: 'resultPdf', maxCount: 1 }]);

function reserveExtraction(_req, res, next) {
  if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS) {
    return res.status(429).json({ success: false, message: 'PDF extraction is busy. Wait briefly and retry.' });
  }
  activeExtractions += 1;
  let released = false;
  const release = () => { if (!released) { released = true; activeExtractions = Math.max(0, activeExtractions - 1); } };
  res.once('finish', release);
  res.once('close', release);
  next();
}

router.get('/batches', requireAuth, requireStaff, controller.batches);
router.get('/batches/:batchId/semesters', requireAuth, requireStaff, controller.semesters);
router.get('/batches/:batchId/exam-sessions', requireAuth, requireStaff, controller.batchExamSessions);
router.get('/semesters/:semesterId/exam-sessions', requireAuth, requireStaff, controller.examSessions);
router.post('/preview', requireAuth, requireStaff, csrfMiddleware, reserveExtraction, (req, res, next) => {
  receivePdf(req, res, (error) => error ? controller.handleUploadError(error, res) : next());
}, controller.preview);
router.post('/validate', requireAuth, requireStaff, csrfMiddleware, require('express').json({ limit: '2mb' }), controller.validate);
router.post('/confirm', requireAuth, requireStaff, csrfMiddleware, require('express').json({ limit: '2mb' }), controller.confirm);

module.exports = router;
