const resultModel = require('../models/resultModel');

async function initResultsTable() {
  await resultModel.createResultsTable();
}

async function createResultService(data) {
  const { usn, subject_code, subject_name, marks_obtained, max_marks, exam_session_id } = data;
  if (!usn || !subject_code || !subject_name || marks_obtained === undefined || !max_marks || !exam_session_id) {
    const err = new Error('All result fields are required.');
    err.status = 400;
    throw err;
  }
  const marks = parseFloat(marks_obtained);
  const max = parseFloat(max_marks);
  if (isNaN(marks) || isNaN(max) || max <= 0) {
    const err = new Error('Invalid marks values.');
    err.status = 400;
    throw err;
  }
  let grade = null;
  let status = 'Fail';
  const pct = (marks / max) * 100;
  if (pct >= 80) { grade = 'A+'; status = 'Pass'; }
  else if (pct >= 70) { grade = 'A'; status = 'Pass'; }
  else if (pct >= 60) { grade = 'B'; status = 'Pass'; }
  else if (pct >= 50) { grade = 'C'; status = 'Pass'; }
  else if (pct >= 40) { grade = 'D'; status = 'Pass'; }
  else { grade = 'F'; status = 'Fail'; }
  return resultModel.createResult({ usn, subject_code, subject_name, marks_obtained: marks, max_marks: max, grade, status, exam_session_id });
}

async function listResultsService(search = '') {
  return resultModel.getAllResults(search);
}

async function getResultsByExamSessionService(examSessionId) {
  return resultModel.getResultsByExamSession(examSessionId);
}

async function getResultStatsService() {
  return resultModel.getResultStats();
}

async function deleteResultService(id) {
  const deleted = await resultModel.deleteResult(id);
  if (!deleted) {
    const err = new Error('Result not found.');
    err.status = 404;
    throw err;
  }
  return { message: 'Result deleted successfully.' };
}

module.exports = {
  initResultsTable,
  createResultService,
  listResultsService,
  getResultsByExamSessionService,
  getResultStatsService,
  deleteResultService
};