'use strict';

const express = require('express');
const { requireAuth, requireStaff } = require('../middleware/authMiddleware');
const controller = require('../controllers/reportController');
const router = express.Router();

router.use(requireAuth, requireStaff);
router.get('/filters', controller.filters);
router.get('/consolidated', controller.generate('consolidated'));
router.get('/class', controller.generate('class'));
router.get('/topper', controller.generate('topper'));
router.get('/failed', controller.generate('failed'));
router.get('/subject-wise', controller.generate('subject-wise'));
router.get('/student', controller.generate('student'));
router.get('/export/:type', controller.export);

module.exports = router;
