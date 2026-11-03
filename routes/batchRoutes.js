const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');
const batchController = require('../controllers/batchController');

const batchValidation = [
  body('batch_name').trim().notEmpty().withMessage('Batch name is required.').escape(),
  body('start_year').isInt({ min: 1900, max: 2100 }).withMessage('Valid start year is required.'),
  body('end_year').isInt({ min: 1900, max: 2100 }).withMessage('Valid end year is required.'),
  body('status').isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive.')
];

const statusValidation = [
  body('status').isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive.')
];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

// GET all batches + counts
router.get('/', requireAuth, batchController.listBatches);

// GET single batch
router.get('/:id', requireAuth, batchController.getBatch);

// POST create batch
router.post('/', requireAuth, batchValidation, handleValidation, batchController.createBatch);

// PUT update batch
router.put('/:id', requireAuth, batchValidation, handleValidation, batchController.updateBatch);

// PATCH status
router.patch('/:id/status', requireAuth, statusValidation, handleValidation, batchController.changeStatus);

// DELETE batch
router.delete('/:id', requireAuth, batchController.deleteBatch);

module.exports = router;
