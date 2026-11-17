const express = require('express');
const router = express.Router();
const { requireAuth, requireStaff, csrfMiddleware } = require('../middleware/authMiddleware');
const resultController = require('../controllers/resultController');

router.get('/', requireAuth, resultController.getAllResults);
router.get('/stats', requireAuth, resultController.getResultStats);
router.get('/session/:examSessionId', requireAuth, resultController.getResultsByExamSession);
router.post('/', requireAuth, requireStaff, csrfMiddleware, resultController.createResult);
router.delete('/:id', requireAuth, requireStaff, csrfMiddleware, resultController.deleteResult);

module.exports = router;
