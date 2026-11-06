const subjectModel = require('../models/subjectModel');

async function initSubjectsTable() {
  await subjectModel.createSubjectsTable();
}

async function createSubjectService(data) {
  const { subject_code, subject_name, semester_id, credits, status } = data;
  if (!subject_code || !subject_name || !semester_id) {
    const err = new Error('Subject code, name, and semester are required.');
    err.status = 400;
    throw err;
  }
  return subjectModel.createSubject(data);
}

async function listSubjectsService(search = '') {
  return subjectModel.getAllSubjects(search);
}

async function getSubjectService(id) {
  const subject = await subjectModel.getSubjectById(id);
  if (!subject) {
    const err = new Error('Subject not found.');
    err.status = 404;
    throw err;
  }
  return subject;
}

async function updateSubjectService(id, data) {
  const updated = await subjectModel.updateSubject(id, data);
  if (!updated) {
    const err = new Error('Subject not found.');
    err.status = 404;
    throw err;
  }
  return subjectModel.getSubjectById(id);
}

async function deleteSubjectService(id) {
  const deleted = await subjectModel.deleteSubject(id);
  if (!deleted) {
    const err = new Error('Subject not found.');
    err.status = 404;
    throw err;
  }
  return { message: 'Subject deleted successfully.' };
}

async function getSubjectsBySemesterService(semesterId) {
  return subjectModel.getSubjectsBySemester(semesterId);
}

module.exports = {
  initSubjectsTable,
  createSubjectService,
  listSubjectsService,
  getSubjectService,
  updateSubjectService,
  deleteSubjectService,
  getSubjectsBySemesterService
};