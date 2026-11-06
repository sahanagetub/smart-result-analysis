const { getPool, isDbDisabled } = require('../config/db');

async function createExamSessionsTable() {
  if (isDbDisabled()) {
    console.log('Database disabled: skipping exam_sessions table creation.');
    return;
  }
  const pool = getPool();
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS exam_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        semester_id INT NOT NULL,
        session_name VARCHAR(100) NOT NULL,
        start_date DATE,
        end_date DATE,
        status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_semester_id (semester_id),
        INDEX idx_session_name (semester_id, session_name),
        CONSTRAINT fk_exam_sessions_semesters FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('exam_sessions table ensured.');
  } catch (err) {
    console.error('Failed to create exam_sessions table:', err.message);
  } finally {
    conn.release();
  }
}

async function createExamSession(data) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  
  // Validate semester exists
  const semesterCheck = await pool.execute(
    'SELECT id FROM semesters WHERE id = ?',
    [data.semester_id]
  );
  if (semesterCheck[0].length === 0) {
    throw new Error('Semester not found.');
  }
  
  // Validate semester number uniqueness within the same semester
  const sessionCheck = await pool.execute(
    'SELECT id FROM exam_sessions WHERE semester_id = ? AND session_name = ?',
    [data.semester_id, data.session_name]
  );
  if (sessionCheck[0].length > 0) {
    throw new Error('Exam session name already exists in this semester.');
  }
  
  const [result] = await pool.execute(
    'INSERT INTO exam_sessions (semester_id, session_name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)',
    [data.semester_id, data.session_name, data.start_date, data.end_date, data.status || 'Active']
  );
  return result.insertId;
}

async function getExamSessionsBySemester(semesterId, search = '') {
  if (isDbDisabled()) {
    return [];
  }
  const pool = getPool();
  if (!pool) return [];
  let sql = 'SELECT es.id, es.session_name, es.start_date, es.end_date, es.status, s.semester_number, s.semester_name FROM exam_sessions es JOIN semesters s ON es.semester_id = s.id WHERE es.semester_id = ?';
  const params = [semesterId];
  if (search) {
    sql += ' AND (es.session_name LIKE ?)';
    params.push('%' + search + '%');
  }
  sql += ' ORDER BY es.id';
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getExamSessionById(id) {
  if (isDbDisabled()) {
    return null;
  }
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    'SELECT es.id, es.session_name, es.start_date, es.end_date, es.status, s.semester_number, s.semester_name FROM exam_sessions es JOIN semesters s ON es.semester_id = s.id WHERE es.id = ?',
    [id]
  );
  return rows.length ? rows[0] : null;
}

async function examSessionExists(semesterId, sessionName) {
  if (isDbDisabled()) {
    return false;
  }
  const pool = getPool();
  if (!pool) return false;
  const [rows] = await pool.execute(
    'SELECT id FROM exam_sessions WHERE semester_id = ? AND session_name = ?',
    [semesterId, sessionName]
  );
  return rows.length > 0;
}

module.exports = {
  createExamSessionsTable,
  createExamSession,
  getExamSessionsBySemester,
  getExamSessionById,
  examSessionExists
};