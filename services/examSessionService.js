const examSessionModel = require('../models/examSessionModel');

async function initExamSessionsTable() {
  await examSessionModel.createExamSessionsTable();
}

async function createExamSessionService(data) {
  // Validate semester existence
  const semesterCheck = await require('../config/db').getPool().execute(
    'SELECT id FROM semesters WHERE id = ?',
    [data.semester_id]
  );
  if (semesterCheck[0].length === 0) {
    throw new Error('Semester not found.');
  }

  // Check for duplicate session name within the same semester
  const exists = await examSessionModel.examSessionExists(data.semester_id, data.session_name);
  if (exists) {
    throw new Error('Exam session name already exists in this semester.');
  }

  // Create the exam session
  const result = await examSessionModel.createExamSession(data);
  return { success: true, data: result, message: 'Exam session created successfully.' };
}

async function getAllExamSessionsService() {
  const pool = require('../config/db').getPool();
  if (!pool) {
    return { success: false, message: 'Database pool unavailable.' };
  }
  const [rows] = await pool.execute(
    'SELECT es.id, es.session_name, es.start_date, es.end_date, es.status, s.semester_number, s.semester_name FROM exam_sessions es JOIN semesters s ON es.semester_id = s.id ORDER BY es.id'
  );
  return { success: true, data: rows };
}

async function getExamSessionsBySemesterService(semesterId, search = '') {
  const pool = require('../config/db').getPool();
  if (!pool) {
    return { success: false, message: 'Database pool unavailable.' };
  }
  let sql = 'SELECT es.id, es.session_name, es.start_date, es.end_date, es.status, s.semester_number, s.semester_name FROM exam_sessions es JOIN semesters s ON es.semester_id = s.id WHERE es.semester_id = ?';
  const params = [semesterId];
  if (search) {
    sql += ' AND es.session_name LIKE ?';
    params.push('%' + search + '%');
  }
  sql += ' ORDER BY es.id';
  const [rows] = await pool.execute(sql, params);
  return { success: true, data: rows };
}

async function getExamSessionByIdService(id) {
  const result = await examSessionModel.getExamSessionById(id);
  if (!result) {
    return { success: false, message: 'Exam session not found.' };
  }
  return { success: true, data: result };
}

async function updateExamSessionService(id, data) {
  const pool = require('../config/db').getPool();
  if (!pool) {
    throw new Error('Database pool unavailable.');
  }

  // Check if exam session exists
  const existing = await examSessionModel.getExamSessionById(id);
  if (!existing) {
    throw new Error('Exam session not found.');
  }

  // Build update query
  let sql = 'UPDATE exam_sessions SET ';
  const updates = [];
  const params = [];

  if (data.session_name !== undefined) {
    updates.push('session_name = ?');
    params.push(data.session_name);
  }
  if (data.start_date !== undefined) {
    updates.push('start_date = ?');
    params.push(data.start_date);
  }
  if (data.end_date !== undefined) {
    updates.push('end_date = ?');
    params.push(data.end_date);
  }
  if (data.status !== undefined) {
    updates.push('status = ?');
    params.push(data.status);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update.');
  }

  sql += updates.join(', ') + ' WHERE id = ?';
  params.push(id);

  const [result] = await pool.execute(sql, params);

  if (result.affectedRows === 0) {
    throw new Error('Exam session update failed.');
  }

  // Return updated exam session
  const updated = await examSessionModel.getExamSessionById(id);
  return { success: true, data: updated, message: 'Exam session updated successfully.' };
}

async function deleteExamSessionService(id) {
  const pool = require('../config/db').getPool();
  if (!pool) {
    throw new Error('Database pool unavailable.');
  }

  // Check if exam session exists
  const existing = await examSessionModel.getExamSessionById(id);
  if (!existing) {
    throw new Error('Exam session not found.');
  }

  // Delete the exam session
  const [result] = await pool.execute(
    'DELETE FROM exam_sessions WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    throw new Error('Exam session delete failed.');
  }

  return { success: true, message: 'Exam session deleted successfully.' };
}

async function updateExamSessionStatusService(id, status) {
  const pool = require('../config/db').getPool();
  if (!pool) {
    throw new Error('Database pool unavailable.');
  }

  // Check if exam session exists
  const existing = await examSessionModel.getExamSessionById(id);
  if (!existing) {
    throw new Error('Exam session not found.');
  }

  // Update the status
  const [result] = await pool.execute(
    'UPDATE exam_sessions SET status = ? WHERE id = ?',
    [status, id]
  );

  if (result.affectedRows === 0) {
    throw new Error('Exam session status update failed.');
  }

  // Return updated exam session
  const updated = await examSessionModel.getExamSessionById(id);
  return { success: true, data: updated, message: 'Exam session status updated successfully.' };
}

module.exports = {
  initExamSessionsTable,
  createExamSessionService,
  getAllExamSessionsService,
  getExamSessionsBySemesterService,
  getExamSessionByIdService,
  updateExamSessionService,
  deleteExamSessionService,
  updateExamSessionStatusService
};
 
