const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAdmin, csrfMiddleware } = require('../middleware/authMiddleware');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');

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
  csrfMiddleware,
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

router.post('/logout', csrfMiddleware, authController.logout);
router.get('/me', csrfMiddleware, authController.me);

router.get('/csrf', requireAuth, (req, res) => res.json({ success: true, csrfToken: req.session._csrf }));

const validateUser = [
  body('username').optional().trim().notEmpty().isLength({ max: 50 }).withMessage('Username must contain 1 to 50 characters.'),
  body('staff_code').optional({ values: 'falsy' }).trim().matches(/^[A-Za-z0-9_-]{1,40}$/).withMessage('Staff code may contain letters, numbers, hyphens, and underscores (up to 40 characters).'),
  body('password').optional({ values: 'falsy' }).isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  body('full_name').optional().trim().notEmpty().isLength({ max: 100 }).withMessage('Full name must contain 1 to 100 characters.'),
  body('email').optional().trim().isEmail().isLength({ max: 100 }).withMessage('Valid email is required.'),
  body('role').optional().equals('Staff').withMessage('Only Staff accounts can be created or assigned here.'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive.')
];
const validateBody = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed.', errors: errors.array() });
  next();
};
router.post(
  '/first-login-password', requireAuth, csrfMiddleware,
  [
    body('newPassword').isLength({ min: 8, max: 128 }).withMessage('Choose a password between 8 and 128 characters.'),
    body('confirmPassword').notEmpty().withMessage('Confirm your new password.')
  ],
  validateBody,
  authController.changeFirstLoginPassword
);
const adminUsers = [requireAuth, requireAdmin];
router.get('/users', ...adminUsers, userController.listUsers);
router.get('/users/:id', ...adminUsers, userController.getUser);
router.post('/users', ...adminUsers, csrfMiddleware, validateUser, validateBody, userController.createUser);
router.put('/users/:id', ...adminUsers, csrfMiddleware, validateUser, validateBody, userController.updateUser);
router.delete('/users/:id', ...adminUsers, csrfMiddleware, userController.deleteUser);

module.exports = router;
