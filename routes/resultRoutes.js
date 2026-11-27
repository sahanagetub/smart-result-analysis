const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, csrfMiddleware } = require('../middleware/authMiddleware');
const resultController = require('../controllers/resultController');

router.get('/', requireAuth, resultController.getAllResults);
router.get('/stats', requireAuth, resultController.getResultStats);
router.get('/session/:examSessionId', requireAuth, resultController.getResultsByExamSession);
router.post('/', requireAuth, requireAdmin, csrfMiddleware, resultController.createResult);
router.delete('/:id', requireAuth, requireAdmin, csrfMiddleware, resultController.deleteResult);

module.exports = router;
