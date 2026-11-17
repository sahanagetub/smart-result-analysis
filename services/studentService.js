const studentModel = require('../models/studentModel');
const batchModel = require('../models/batchModel');

async function initStudentsTable() {
  await studentModel.createStudentsTable();
}

async function addStudentService(data) {
  // Validate batch exists
  const batch = await batchModel.getBatchById(data.batch_id);
  if (!batch) {
    const err = new Error('Selected batch does not exist.');
    err.status = 400;
    throw err;
  }

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
  const id = await studentModel.createStudent(data);
  return studentModel.getStudentById(id);
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

async function getExistingUsnsService() {
  return studentModel.getAllUsns();
}

async function getExistingEmailsService() {
  return studentModel.getAllEmails();
}

async function getCountsByBatchService() {
  return studentModel.getStudentCountsByBatch();
}

async function updateStudentService(id, data) {
  if (data.batch_id !== undefined) {
    const batch = await batchModel.getBatchById(data.batch_id);
    if (!batch) {
      const err = new Error('Selected batch does not exist.');
      err.status = 400;
      throw err;
    }
  }

  // Validate uniqueness excluding current
  if (data.usn) {
    const exists = await studentModel.usnExists(data.usn, id);
    if (exists) {
      const err = new Error('USN already exists.');
      err.status = 409;
      throw err;
    }
  }
  if (data.email) {
    const emailExists = await studentModel.emailExists(data.email, id);
    if (emailExists) {
      const err = new Error('Email already exists.');
      err.status = 409;
      throw err;
    }
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
  const student = await studentModel.getStudentById(id);
  if (!student) {
    const err = new Error('Student not found.');
    err.status = 404;
    throw err;
  }

  const resultCount = await studentModel.countResultsForStudent(student.usn);
  if (resultCount > 0) {
    const err = new Error(`Cannot delete student "${student.name}" (${student.usn}): ${resultCount} exam result(s) are recorded for this student.`);
    err.status = 400;
    throw err;
  }

  const deleted = await studentModel.deleteStudent(id);
  if (!deleted) {
    const err = new Error('Student delete failed.');
    err.status = 500;
    throw err;
  }
  return student;
}

module.exports = {
  initStudentsTable,
  addStudentService,
  listStudentsService,
  getStudentService,
  getCountsByBatchService,
  updateStudentService,
  deleteStudentService,
  getExistingUsnsService,
  getExistingEmailsService
};