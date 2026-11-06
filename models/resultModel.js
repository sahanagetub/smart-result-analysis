const { getPool, isDbDisabled } = require('../config/db');

async function createResultsTable() {
  if (isDbDisabled()) {
    console.log('Database disabled: skipping results table creation.');
    return;
  }
  const pool = getPool();
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usn VARCHAR(20) NOT NULL,
        subject_code VARCHAR(20) NOT NULL,
        subject_name VARCHAR(100) NOT NULL,
        marks_obtained DECIMAL(5,2) NOT NULL,
        max_marks DECIMAL(5,2) NOT NULL,
        grade VARCHAR(5) NULL,
        status ENUM('Pass','Fail') NOT NULL,
        exam_session_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_usn (usn),
        INDEX idx_exam_session (exam_session_id),
        INDEX idx_subject (subject_code),
        CONSTRAINT fk_results_exam_session FOREIGN KEY (exam_session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('results table ensured.');
  } catch (err) {
    console.error('Failed to create results table:', err.message);
  } finally {
    conn.release();
  }
}

async function createResult(data) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(
    `INSERT INTO results (usn, subject_code, subject_name, marks_obtained, max_marks, grade, status, exam_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.usn, data.subject_code, data.subject_name, data.marks_obtained, data.max_marks, data.grade || null, data.status, data.exam_session_id]
  );
  return result.insertId;
}

async function getAllResults(search = '') {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];
  let sql = `SELECT r.id, r.usn, r.subject_code, r.subject_name, r.marks_obtained, r.max_marks,
                    r.grade, r.status, r.exam_session_id, r.created_at,
                    es.session_name, s.semester_number, s.semester_name
             FROM results r
             JOIN exam_sessions es ON r.exam_session_id = es.id
             JOIN semesters s ON es.semester_id = s.id`;
  const params = [];
  if (search) {
    sql += ` WHERE r.usn LIKE ? OR r.subject_name LIKE ?`;
    params.push('%' + search + '%', '%' + search + '%');
  }
  sql += ` ORDER BY r.created_at DESC`;
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getResultsByExamSession(examSessionId) {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];
  const [rows] = await pool.execute(
    `SELECT r.id, r.usn, r.subject_code, r.subject_name, r.marks_obtained, r.max_marks,
              r.grade, r.status, r.created_at
     FROM results r WHERE r.exam_session_id = ? ORDER BY r.usn, r.subject_code`,
    [examSessionId]
  );
  return rows;
}

async function getResultStats() {
  if (isDbDisabled()) return { total: 0, pass: 0, fail: 0, passPercent: 0 };
  const pool = getPool();
  if (!pool) return { total: 0, pass: 0, fail: 0, passPercent: 0 };
  const [rows] = await pool.execute(`SELECT status, COUNT(*) AS cnt FROM results GROUP BY status`);
  let total = 0, pass = 0, fail = 0;
  rows.forEach((r) => { total += Number(r.cnt); if (r.status === 'Pass') pass = Number(r.cnt); if (r.status === 'Fail') fail = Number(r.cnt); });
  return { total, pass, fail, passPercent: total > 0 ? Math.round((pass / total) * 100) : 0 };
}

async function deleteResult(id) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(`DELETE FROM results WHERE id = ?`, [id]);
  return result.affectedRows > 0;
}

module.exports = {
  createResultsTable,
  createResult,
  getAllResults,
  getResultsByExamSession,
  getResultStats,
  deleteResult
};