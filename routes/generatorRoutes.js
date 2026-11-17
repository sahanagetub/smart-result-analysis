'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, csrfMiddleware } = require('../middleware/authMiddleware');
const generatorController = require('../controllers/generatorController');

router.get('/options', requireAuth, requireAdmin, generatorController.getOptions);
router.post('/generate', requireAuth, requireAdmin, csrfMiddleware, generatorController.generate);

module.exports = router;
