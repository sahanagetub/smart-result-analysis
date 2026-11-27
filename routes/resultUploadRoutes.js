'use strict';

const express = require('express');
const multer = require('multer');
const { requireAuth, requireStaff, csrfMiddleware } = require('../middleware/authMiddleware');
const controller = require('../controllers/resultUploadController');

const router = express.Router();
let activePreviews = 0;
const MAX_CONCURRENT_PREVIEWS = 3;
const receiveFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 2 }
}).single('resultFile');

function reservePreview(req, res, next) {
  if (activePreviews >= MAX_CONCURRENT_PREVIEWS) {
    return res.status(429).json({ success: false, message: 'The upload preview service is busy. Wait a moment and retry.' });
  }
  activePreviews += 1;
  let released = false;
  const release = () => { if (!released) { released = true; activePreviews = Math.max(0, activePreviews - 1); } };
  res.once('finish', release);
  res.once('close', release);
  next();
}

router.post('/preview', requireAuth, requireStaff, csrfMiddleware, reservePreview, (req, res, next) => {
  receiveFile(req, res, (error) => error ? controller.handleUploadError(error, res) : next());
}, controller.preview);
router.get('/sessions', requireAuth, requireStaff, controller.sessions);
router.post('/validate-session', requireAuth, requireStaff, csrfMiddleware, express.json({ limit: '2mb' }), controller.validateSession);
router.post('/revalidate-selection', requireAuth, requireStaff, csrfMiddleware, express.json({ limit: '256kb' }), controller.revalidateSelection);
router.post('/confirm', requireAuth, requireStaff, csrfMiddleware, express.json({ limit: '256kb' }), controller.confirm);
router.post('/cancel', requireAuth, requireStaff, csrfMiddleware, express.json({ limit: '16kb' }), controller.cancel);

module.exports = router;
