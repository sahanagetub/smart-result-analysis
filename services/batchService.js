const batchModel = require('../models/batchModel');

async function initBatchesTable() {
  await batchModel.createBatchesTable();
}

async function createBatchService(data) {
  // Validate uniqueness
  const exists = await batchModel.batchNameExists(data.batch_name);
  if (exists) {
    const err = new Error('Batch name already exists.');
    err.status = 409;
    throw err;
  }
  return batchModel.createBatch(data);
}

async function listBatchesService(search = '') {
  return batchModel.getAllBatches(search);
}

async function getBatchService(id) {
  const batch = await batchModel.getBatchById(id);
  if (!batch) {
    const err = new Error('Batch not found.');
    err.status = 404;
    throw err;
  }
  return batch;
}

async function editBatchService(id, data) {
  // Validate uniqueness excluding current
  const exists = await batchModel.batchNameExists(data.batch_name, id);
  if (exists) {
    const err = new Error('Batch name already exists.');
    err.status = 409;
    throw err;
  }
  const updated = await batchModel.updateBatch(id, data);
  if (!updated) {
    const err = new Error('Batch not found.');
    err.status = 404;
    throw err;
  }
  return batchModel.getBatchById(id);
}

async function removeBatchService(id) {
  const batch = await batchModel.getBatchById(id);
  if (!batch) {
    const err = new Error('Batch not found.');
    err.status = 404;
    throw err;
  }

  const { studentsCount, semestersCount } = await batchModel.getRelatedCounts(id);
  if (studentsCount > 0 || semestersCount > 0) {
    const reasons = [];
    if (studentsCount > 0) reasons.push(`${studentsCount} student(s)`);
    if (semestersCount > 0) reasons.push(`${semestersCount} semester(s)`);
    const err = new Error(`Cannot delete batch because it has related records: ${reasons.join(' and ')}. Please remove or reassign them first.`);
    err.status = 400;
    throw err;
  }

  return batchModel.deleteBatch(id);
}

async function toggleBatchStatusService(id, status) {
  const updated = await batchModel.updateBatchStatus(id, status);
  if (!updated) {
    const err = new Error('Batch not found.');
    err.status = 404;
    throw err;
  }
  return batchModel.getBatchById(id);
}

async function getCountsService() {
  return batchModel.getBatchCounts();
}

module.exports = {
  initBatchesTable,
  createBatchService,
  listBatchesService,
  getBatchService,
  editBatchService,
  removeBatchService,
  toggleBatchStatusService,
  getCountsService
};
