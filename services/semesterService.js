const semesterModel = require('../models/semesterModel');
const { isDbDisabled } = require('../config/db');

async function listSemestersService(batchId, search = '') {
  return semesterModel.getSemestersByBatch(batchId, search);
}

async function getSemesterByIdService(id) {
  return semesterModel.getSemesterById(id);
}

async function createSemesterService(data) {
  const { batch_id, semester_number, semester_name, status } = data;

  // Validate required fields
  if (!batch_id || !semester_number || !semester_name) {
    const err = new Error('Batch ID, semester number, and semester name are required.');
    err.status = 400;
    throw err;
  }

  // Check if semester already exists in this batch
  const exists = await semesterModel.semesterExists(batch_id, semester_number);
  if (exists) {
    const err = new Error('A semester with this name already exists in the batch.');
    err.status = 409;
    throw err;
  }

  // Create the semester
  const result = await semesterModel.createSemester({
    batch_id,
    semester_number,
    semester_name,
    status: status || 'Active'
  });

  return result;
}

async function updateSemesterService(id, data) {
  const { semester_name, status } = data;

  if (!semester_name) {
    const err = new Error('Semester name is required.');
    err.status = 400;
    throw err;
  }

  // Check if semester exists
  const existing = await semesterModel.getSemesterById(id);
  if (!existing) {
    const err = new Error('Semester not found.');
    err.status = 404;
    throw err;
  }

  // Update the semester
  const pool = require('../config/db').getPool();
  if (!pool) {
    const err = new Error('Database pool unavailable.');
    err.status = 500;
    throw err;
  }

  const [result] = await pool.execute(
    'UPDATE semesters SET semester_name = ?, status = ? WHERE id = ?',
    [semester_name, status || existing.status, id]
  );

  if (result.affectedRows === 0) {
    const err = new Error('Semester update failed.');
    err.status = 500;
    throw err;
  }

  return semesterModel.getSemesterById(id);
}

async function deleteSemesterService(id) {
  // Check if semester exists
  const existing = await semesterModel.getSemesterById(id);
  if (!existing) {
    const err = new Error('Semester not found.');
    err.status = 404;
    throw err;
  }

  const pool = require('../config/db').getPool();
  if (!pool) {
    const err = new Error('Database pool unavailable.');
    err.status = 500;
    throw err;
  }

  const [result] = await pool.execute(
    'DELETE FROM semesters WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    const err = new Error('Semester delete failed.');
    err.status = 500;
    throw err;
  }

  return { message: 'Semester deleted successfully.' };
}

module.exports = {
  listSemestersService,
  getSemesterByIdService,
  createSemesterService,
  updateSemesterService,
  deleteSemesterService
};
 
