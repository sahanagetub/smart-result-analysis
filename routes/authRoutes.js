const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const authController = require('../controllers/authController');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again later.' }
});

router.post(
  '/login',
  loginLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required.').escape(),
    body('password').notEmpty().withMessage('Password is required.')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  },
  authController.login
);

router.post('/logout', authController.logout);
router.get('/me', authController.me);

// Admin-only user creation
router.post(
  '/users',
  requireAuth,
  requireAdmin,
  [
    body('username').trim().notEmpty().withMessage('Username is required.').escape(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
    body('role').optional().isIn(['Admin', 'Staff']).withMessage('Role must be Admin or Staff.'),
    body('status').optional().isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive.')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  },
  authController.createUser
);

module.exports = router;
