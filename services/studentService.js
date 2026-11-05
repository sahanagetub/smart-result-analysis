const studentModel = require('../models/studentModel');

async function initStudentsTable() {
  await studentModel.createStudentsTable();
}

async function addStudentService(data) {
  // Validate uniqueness
  const usnExists = await studentModel.usnExists(data.usn);
  if (usnExists) {
    const err = new Error('USN already exists.');
    err.status = 409;
    throw err;
  }
  const emailExists = await studentModel.emailExists(data.email);
  if (emailExists) {
    const err = new Error('Email already exists.');
    err.status = 409;
    throw err;
  }
  return studentModel.createStudent(data);
}

async function listStudentsService(batchId, search = '') {
  return studentModel.getStudentsByBatch(batchId, search);
}

async function getStudentService(id) {
  const student = await studentModel.getStudentById(id);
  if (!student) {
    const err = new Error('Student not found.');
    err.status = 404;
    throw err;
  }
  return student;
}

async function getCountsByBatchService() {
  return studentModel.getStudentCountsByBatch();
}

async function updateStudentService(id, data) {
  // Validate uniqueness excluding current
  const exists = await studentModel.usnExists(data.usn, id);
  if (exists) {
    const err = new Error('USN already exists.');
    err.status = 409;
    throw err;
  }
  const emailExists = await studentModel.emailExists(data.email, id);
  if (emailExists) {
    const err = new Error('Email already exists.');
    err.status = 409;
    throw err;
  }
  const updated = await studentModel.updateStudent(id, data);
  if (!updated) {
    const err = new Error('Student not found.');
    err.status = 404;
    throw err;
  }
  return studentModel.getStudentById(id);
}

async function deleteStudentService(id) {
  const deleted = await studentModel.deleteUser(id);
  if (!deleted) {
    const err = new Error('Student not found.');
    err.status = 404;
    throw err;
  }
  return studentModel.getStudentById(id);
}

module.exports = {
  initStudentsTable,
  addStudentService,
  listStudentsService,
  getStudentService,
  getCountsByBatchService,
  updateStudentService,
  deleteStudentService
};