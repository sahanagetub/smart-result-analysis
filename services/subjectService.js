const subjectModel = require('../models/subjectModel');
const semesterModel = require('../models/semesterModel');

async function initSubjectsTable() {
  await subjectModel.createSubjectsTable();
}

async function createSubjectService(data) {
  const { semester_id, subject_code, subject_name } = data;

  if (!semester_id || !subject_code || !subject_name) {
    const err = new Error('Semester, subject code, and subject name are required.');
    err.status = 400;
    throw err;
  }

  // Validate semester exists
  const semester = await semesterModel.getSemesterById(semester_id);
  if (!semester) {
    const err = new Error('Selected semester does not exist.');
    err.status = 400;
    throw err;
  }

  const codeFormatted = String(subject_code).trim().toUpperCase();

  // Validate duplicate subject code in same semester
  const exists = await subjectModel.checkSubjectCodeExists(semester_id, codeFormatted);
  if (exists) {
    const err = new Error(`Subject code "${codeFormatted}" already exists in this semester.`);
    err.status = 409;
    throw err;
  }

  // Marks validation
  const maxInternal = data.max_internal_marks !== undefined ? parseInt(data.max_internal_marks, 10) : 40;
  const maxExternal = data.max_external_marks !== undefined ? parseInt(data.max_external_marks, 10) : 60;
  const totalMax = data.total_maximum_marks !== undefined ? parseInt(data.total_maximum_marks, 10) : (maxInternal + maxExternal);

  if (maxInternal < 0 || maxExternal < 0 || totalMax <= 0) {
    const err = new Error('Maximum marks must be non-negative, and total marks must be greater than zero.');
    err.status = 400;
    throw err;
  }

  const id = await subjectModel.createSubject({
    semester_id: parseInt(semester_id, 10),
    subject_code: codeFormatted,
    subject_name: String(subject_name).trim(),
    max_internal_marks: maxInternal,
    max_external_marks: maxExternal,
    total_maximum_marks: totalMax,
    credits: data.credits !== undefined ? parseInt(data.credits, 10) : 4,
    status: data.status || 'Active'
  });

  return subjectModel.getSubjectById(id);
}

async function listSubjectsService(search = '', semesterId = '') {
  return subjectModel.getAllSubjects(search, semesterId);
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
  const existing = await subjectModel.getSubjectById(id);
  if (!existing) {
    const err = new Error('Subject not found.');
    err.status = 404;
    throw err;
  }

  const targetSemesterId = data.semester_id !== undefined ? parseInt(data.semester_id, 10) : existing.semester_id;
  const targetCode = data.subject_code !== undefined ? String(data.subject_code).trim().toUpperCase() : existing.subject_code;

  if (data.semester_id !== undefined) {
    const semester = await semesterModel.getSemesterById(targetSemesterId);
    if (!semester) {
      const err = new Error('Selected semester does not exist.');
      err.status = 400;
      throw err;
    }
  }

  // Check duplicate code within the semester
  if (data.subject_code !== undefined || data.semester_id !== undefined) {
    const exists = await subjectModel.checkSubjectCodeExists(targetSemesterId, targetCode, id);
    if (exists) {
      const err = new Error(`Subject code "${targetCode}" already exists in this semester.`);
      err.status = 409;
      throw err;
    }
    data.subject_code = targetCode;
  }

  if (data.subject_name !== undefined) {
    data.subject_name = String(data.subject_name).trim();
  }

  // Marks check
  const maxInternal = data.max_internal_marks !== undefined ? parseInt(data.max_internal_marks, 10) : existing.max_internal_marks;
  const maxExternal = data.max_external_marks !== undefined ? parseInt(data.max_external_marks, 10) : existing.max_external_marks;
  const totalMax = data.total_maximum_marks !== undefined ? parseInt(data.total_maximum_marks, 10) : (maxInternal + maxExternal);

  data.max_internal_marks = maxInternal;
  data.max_external_marks = maxExternal;
  data.total_maximum_marks = totalMax;

  const updated = await subjectModel.updateSubject(id, data);
  if (!updated) {
    const err = new Error('Subject update failed.');
    err.status = 400;
    throw err;
  }

  return subjectModel.getSubjectById(id);
}

async function deleteSubjectService(id) {
  const existing = await subjectModel.getSubjectById(id);
  if (!existing) {
    const err = new Error('Subject not found.');
    err.status = 404;
    throw err;
  }

  // Related record protection: check student results
  const resultsCount = await subjectModel.countResultsForSubject(existing.subject_code);
  if (resultsCount > 0) {
    const err = new Error(`Cannot delete subject "${existing.subject_name}" (${existing.subject_code}): It has ${resultsCount} recorded student exam result(s). Please remove results first.`);
    err.status = 400;
    throw err;
  }

  const deleted = await subjectModel.deleteSubject(id);
  if (!deleted) {
    const err = new Error('Subject delete failed.');
    err.status = 500;
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
