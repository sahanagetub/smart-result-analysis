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

  const [result] = await pool.execute(
    'INSERT INTO exam_sessions (semester_id, session_name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)',
    [
      data.semester_id,
      data.session_name,
      data.start_date || null,
      data.end_date || null,
      data.status || 'Active'
    ]
  );
  return result.insertId;
}

async function getAllExamSessions(search = '', semesterId = '') {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];

  let sql = `
    SELECT es.id, es.semester_id, es.session_name, es.start_date, es.end_date, es.status, es.created_at, es.updated_at,
           s.semester_number, s.semester_name, b.id AS batch_id, b.batch_name
    FROM exam_sessions es
    JOIN semesters s ON es.semester_id = s.id
    JOIN batches b ON s.batch_id = b.id
  `;
  const conditions = [];
  const params = [];

  if (semesterId) {
    conditions.push('es.semester_id = ?');
    params.push(semesterId);
  }
  if (search) {
    conditions.push('(es.session_name LIKE ? OR s.semester_name LIKE ? OR b.batch_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY es.created_at DESC, es.id DESC';

  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getExamSessionsBySemester(semesterId, search = '') {
  return getAllExamSessions(search, semesterId);
}

async function getExamSessionById(id) {
  if (isDbDisabled()) return null;
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT es.id, es.semester_id, es.session_name, es.start_date, es.end_date, es.status, es.created_at, es.updated_at,
            s.semester_number, s.semester_name, b.id AS batch_id, b.batch_name
     FROM exam_sessions es
     JOIN semesters s ON es.semester_id = s.id
     JOIN batches b ON s.batch_id = b.id
     WHERE es.id = ?`,
    [id]
  );
  return rows.length ? rows[0] : null;
}

async function updateExamSession(id, data) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');

  const fields = [];
  const params = [];

  if (data.session_name !== undefined) {
    fields.push('session_name = ?');
    params.push(data.session_name);
  }
  if (data.start_date !== undefined) {
    fields.push('start_date = ?');
    params.push(data.start_date || null);
  }
  if (data.end_date !== undefined) {
    fields.push('end_date = ?');
    params.push(data.end_date || null);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }
  if (data.semester_id !== undefined) {
    fields.push('semester_id = ?');
    params.push(data.semester_id);
  }

  if (fields.length === 0) return false;
  params.push(id);

  const [result] = await pool.execute(
    `UPDATE exam_sessions SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows > 0;
}

async function updateExamSessionStatus(id, status) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');

  const [result] = await pool.execute(
    'UPDATE exam_sessions SET status = ? WHERE id = ?',
    [status, id]
  );
  return result.affectedRows > 0;
}

async function deleteExamSession(id) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');

  const [result] = await pool.execute('DELETE FROM exam_sessions WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function examSessionExists(semesterId, sessionName, excludeId = null) {
  if (isDbDisabled()) return false;
  const pool = getPool();
  if (!pool) return false;

  let sql = 'SELECT id FROM exam_sessions WHERE semester_id = ? AND session_name = ?';
  const params = [semesterId, sessionName];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0;
}

async function countResultsForSession(sessionId) {
  if (isDbDisabled()) return 0;
  const pool = getPool();
  if (!pool) return 0;

  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM results WHERE exam_session_id = ?',
    [sessionId]
  );
  return Number(rows[0]?.cnt || 0);
}

async function getExamSessionStats() {
  if (isDbDisabled()) {
    return { total: 0, active: 0, inactive: 0 };
  }
  const pool = getPool();
  if (!pool) return { total: 0, active: 0, inactive: 0 };

  const [rows] = await pool.execute(`
    SELECT status, COUNT(*) AS cnt FROM exam_sessions GROUP BY status
  `);
  let total = 0, active = 0, inactive = 0;
  rows.forEach((r) => {
    total += Number(r.cnt);
    if (r.status === 'Active') active = Number(r.cnt);
    if (r.status === 'Inactive') inactive = Number(r.cnt);
  });
  return { total, active, inactive };
}

module.exports = {
  createExamSessionsTable,
  createExamSession,
  getAllExamSessions,
  getExamSessionsBySemester,
  getExamSessionById,
  updateExamSession,
  updateExamSessionStatus,
  deleteExamSession,
  examSessionExists,
  countResultsForSession,
  getExamSessionStats
};
