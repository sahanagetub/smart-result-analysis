const examSessionModel = require('../models/examSessionModel');
const semesterModel = require('../models/semesterModel');

async function initExamSessionsTable() {
  await examSessionModel.createExamSessionsTable();
}

async function createExamSessionService(data) {
  const { semester_id, session_name, start_date, end_date, status } = data;

  if (!semester_id || !session_name) {
    const err = new Error('Semester ID and session name are required.');
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

  // Validate dates if both provided
  if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
    const err = new Error('End date cannot be earlier than start date.');
    err.status = 400;
    throw err;
  }

  // Check duplicate session name within same semester
  const exists = await examSessionModel.examSessionExists(semester_id, String(session_name).trim());
  if (exists) {
    const err = new Error('Exam session name already exists in this semester.');
    err.status = 409;
    throw err;
  }

  const id = await examSessionModel.createExamSession({
    semester_id,
    session_name: String(session_name).trim(),
    start_date: start_date || null,
    end_date: end_date || null,
    status: status || 'Active'
  });

  const created = await examSessionModel.getExamSessionById(id);
  return { success: true, data: created, message: 'Exam session created successfully.' };
}

async function getAllExamSessionsService(search = '', semesterId = '') {
  const rows = await examSessionModel.getAllExamSessions(search, semesterId);
  return { success: true, data: rows };
}

async function getExamSessionsBySemesterService(semesterId, search = '') {
  const rows = await examSessionModel.getExamSessionsBySemester(semesterId, search);
  return { success: true, data: rows };
}

async function getExamSessionByIdService(id) {
  const session = await examSessionModel.getExamSessionById(id);
  if (!session) {
    const err = new Error('Exam session not found.');
    err.status = 404;
    throw err;
  }
  return { success: true, data: session };
}

async function updateExamSessionService(id, data) {
  const existing = await examSessionModel.getExamSessionById(id);
  if (!existing) {
    const err = new Error('Exam session not found.');
    err.status = 404;
    throw err;
  }

  const semId = data.semester_id || existing.semester_id;
  if (data.session_name) {
    const nameTrim = String(data.session_name).trim();
    const exists = await examSessionModel.examSessionExists(semId, nameTrim, id);
    if (exists) {
      const err = new Error('Exam session name already exists in this semester.');
      err.status = 409;
      throw err;
    }
    data.session_name = nameTrim;
  }

  const sDate = data.start_date !== undefined ? data.start_date : existing.start_date;
  const eDate = data.end_date !== undefined ? data.end_date : existing.end_date;
  if (sDate && eDate && new Date(eDate) < new Date(sDate)) {
    const err = new Error('End date cannot be earlier than start date.');
    err.status = 400;
    throw err;
  }

  const updated = await examSessionModel.updateExamSession(id, data);
  if (!updated) {
    const err = new Error('Exam session update failed.');
    err.status = 400;
    throw err;
  }

  const result = await examSessionModel.getExamSessionById(id);
  return { success: true, data: result, message: 'Exam session updated successfully.' };
}

async function deleteExamSessionService(id) {
  const existing = await examSessionModel.getExamSessionById(id);
  if (!existing) {
    const err = new Error('Exam session not found.');
    err.status = 404;
    throw err;
  }

  // Related record protection: check results
  const resultsCount = await examSessionModel.countResultsForSession(id);
  if (resultsCount > 0) {
    const err = new Error(`Cannot delete exam session "${existing.session_name}": It has ${resultsCount} recorded student exam result(s). Please remove results first.`);
    err.status = 400;
    throw err;
  }

  const deleted = await examSessionModel.deleteExamSession(id);
  if (!deleted) {
    const err = new Error('Exam session delete failed.');
    err.status = 500;
    throw err;
  }

  return { success: true, message: 'Exam session deleted successfully.' };
}

async function updateExamSessionStatusService(id, status) {
  const existing = await examSessionModel.getExamSessionById(id);
  if (!existing) {
    const err = new Error('Exam session not found.');
    err.status = 404;
    throw err;
  }

  if (!['Active', 'Inactive'].includes(status)) {
    const err = new Error('Status must be Active or Inactive.');
    err.status = 400;
    throw err;
  }

  const updated = await examSessionModel.updateExamSessionStatus(id, status);
  if (!updated) {
    const err = new Error('Exam session status update failed.');
    err.status = 500;
    throw err;
  }

  const result = await examSessionModel.getExamSessionById(id);
  return { success: true, data: result, message: `Exam session status updated to ${status}.` };
}

async function getExamSessionStatsService() {
  const stats = await examSessionModel.getExamSessionStats();
  return { success: true, data: stats };
}

module.exports = {
  initExamSessionsTable,
  createExamSessionService,
  getAllExamSessionsService,
  getExamSessionsBySemesterService,
  getExamSessionByIdService,
  updateExamSessionService,
  deleteExamSessionService,
  updateExamSessionStatusService,
  getExamSessionStatsService
};
