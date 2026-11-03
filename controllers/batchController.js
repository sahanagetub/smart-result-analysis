const batchService = require('../services/batchService');

async function listBatches(req, res, next) {
  try {
    const search = req.query.search || '';
    const batches = await batchService.listBatchesService(search);
    const counts = await batchService.getCountsService();
    res.json({ success: true, data: batches, counts });
  } catch (err) {
    next(err);
  }
}

async function getBatch(req, res, next) {
  try {
    const batch = await batchService.getBatchService(req.params.id);
    res.json({ success: true, data: batch });
  } catch (err) {
    next(err);
  }
}

async function createBatch(req, res, next) {
  try {
    const id = await batchService.createBatchService(req.body);
    const batch = await batchService.getBatchService(id);
    res.status(201).json({ success: true, data: batch, message: 'Batch created successfully.' });
  } catch (err) {
    next(err);
  }
}

async function updateBatch(req, res, next) {
  try {
    const batch = await batchService.editBatchService(req.params.id, req.body);
    res.json({ success: true, data: batch, message: 'Batch updated successfully.' });
  } catch (err) {
    next(err);
  }
}

async function changeStatus(req, res, next) {
  try {
    const batch = await batchService.toggleBatchStatusService(req.params.id, req.body.status);
    res.json({ success: true, data: batch, message: `Batch ${req.body.status.toLowerCase()}d.` });
  } catch (err) {
    next(err);
  }
}

async function deleteBatch(req, res, next) {
  try {
    await batchService.removeBatchService(req.params.id);
    res.json({ success: true, message: 'Batch deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listBatches,
  getBatch,
  createBatch,
  updateBatch,
  changeStatus,
  deleteBatch
};
