const semesterModel = require('../models/semesterModel');
const batchModel = require('../models/batchModel');

async function initSemestersTable() {
  await semesterModel.createSemestersTable();
}

async function listSemestersService(batchId = '', search = '', statusFilter = '') {
  return semesterModel.getSemestersByBatch(batchId, search, statusFilter);
}

async function getSemesterByIdService(id) {
  const semester = await semesterModel.getSemesterById(id);
  if (!semester) {
    const err = new Error('Semester not found.');
    err.status = 404;
    throw err;
  }
  return semester;
}

async function createSemesterService(data) {
  const { batch_id, semester_number, semester_name, status } = data;

  if (!batch_id || !semester_number || !semester_name) {
    const err = new Error('Batch ID, semester number, and semester name are required.');
    err.status = 400;
    throw err;
  }

  // Validate batch exists
  const batch = await batchModel.getBatchById(batch_id);
  if (!batch) {
    const err = new Error('Selected batch does not exist.');
    err.status = 400;
    throw err;
  }

  // Check if semester already exists in this batch
  const exists = await semesterModel.semesterExists(batch_id, semester_number);
  if (exists) {
    const err = new Error(`Semester ${semester_number} already exists in this batch.`);
    err.status = 409;
    throw err;
  }

  const id = await semesterModel.createSemester({
    batch_id,
    semester_number: parseInt(semester_number, 10),
    semester_name: String(semester_name).trim(),
    status: status || 'Active'
  });

  return semesterModel.getSemesterById(id);
}

async function updateSemesterService(id, data) {
  const existing = await semesterModel.getSemesterById(id);
  if (!existing) {
    const err = new Error('Semester not found.');
    err.status = 404;
    throw err;
  }

  if (data.semester_number !== undefined) {
    const semNum = parseInt(data.semester_number, 10);
    const exists = await semesterModel.semesterExists(existing.batch_id, semNum, id);
    if (exists) {
      const err = new Error(`Semester ${semNum} already exists in this batch.`);
      err.status = 409;
      throw err;
    }
    data.semester_number = semNum;
  }

  if (data.semester_name !== undefined) {
    data.semester_name = String(data.semester_name).trim();
  }

  const updated = await semesterModel.updateSemester(id, data);
  if (!updated) {
    const err = new Error('Semester update failed.');
    err.status = 400;
    throw err;
  }

  return semesterModel.getSemesterById(id);
}

async function deleteSemesterService(id) {
  const existing = await semesterModel.getSemesterById(id);
  if (!existing) {
    const err = new Error('Semester not found.');
    err.status = 404;
    throw err;
  }

  // Related record protection
  const { subjectsCount, examSessionsCount } = await semesterModel.getRelatedCounts(id);
  if (subjectsCount > 0 || examSessionsCount > 0) {
    const reasons = [];
    if (subjectsCount > 0) reasons.push(`${subjectsCount} subject(s)`);
    if (examSessionsCount > 0) reasons.push(`${examSessionsCount} exam session(s)`);
    const err = new Error(`Cannot delete semester because it has related records: ${reasons.join(' and ')}. Please remove or reassign them first.`);
    err.status = 400;
    throw err;
  }

  const deleted = await semesterModel.deleteSemester(id);
  if (!deleted) {
    const err = new Error('Semester delete failed.');
    err.status = 500;
    throw err;
  }

  return { message: 'Semester deleted successfully.', semester: existing };
}

module.exports = {
  initSemestersTable,
  listSemestersService,
  getSemesterByIdService,
  createSemesterService,
  updateSemesterService,
  deleteSemesterService
};
