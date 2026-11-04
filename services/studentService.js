const studentModel = require('../models/studentService');

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

module.exports = {
  initStudentsTable,
  addStudentService,
  listStudentsService,
  getStudentService,
  getCountsByBatchService
};