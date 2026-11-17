const { getPool, isDbDisabled } = require('../config/db');

async function createSemestersTable() {
  if (isDbDisabled()) {
    console.log('Database disabled: skipping semesters table creation.');
    return;
  }
  const pool = getPool();
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS semesters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id INT NOT NULL,
        semester_number INT NOT NULL,
        semester_name VARCHAR(50) NOT NULL,
        status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_batch_id (batch_id),
        INDEX idx_semester (batch_id, semester_number),
        CONSTRAINT fk_semesters_batches FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('semesters table ensured.');
  } catch (err) {
    console.error('Failed to create semesters table:', err.message);
  } finally {
    conn.release();
  }
}

async function createSemester(data) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(
    'INSERT INTO semesters (batch_id, semester_number, semester_name, status) VALUES (?, ?, ?, ?)',
    [data.batch_id, data.semester_number, data.semester_name, data.status || 'Active']
  );
  return result.insertId;
}

async function getSemestersByBatch(batchId, search = '', statusFilter = '') {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];
  let sql = `
    SELECT s.id, s.batch_id, s.semester_number, s.semester_name, s.status, s.created_at, s.updated_at,
           b.batch_name,
           (SELECT COUNT(*) FROM exam_sessions es WHERE es.semester_id = s.id) AS exam_session_count,
           (SELECT COUNT(*) FROM subjects sub WHERE sub.semester_id = s.id) AS subject_count
    FROM semesters s
    LEFT JOIN batches b ON s.batch_id = b.id
  `;
  const conditions = [];
  const params = [];

  if (batchId) {
    conditions.push('s.batch_id = ?');
    params.push(batchId);
  }
  if (search) {
    conditions.push('(s.semester_name LIKE ? OR s.semester_number LIKE ?)');
    params.push('%' + search + '%', '%' + search + '%');
  }
  if (statusFilter) {
    conditions.push('s.status = ?');
    params.push(statusFilter);
  }
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY s.semester_number ASC';
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getSemesterById(id) {
  if (isDbDisabled()) return null;
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT s.id, s.batch_id, s.semester_number, s.semester_name, s.status, s.created_at, s.updated_at,
            b.batch_name
     FROM semesters s
     LEFT JOIN batches b ON s.batch_id = b.id
     WHERE s.id = ?`,
    [id]
  );
  return rows.length ? rows[0] : null;
}

async function updateSemester(id, data) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');

  const fields = [];
  const params = [];

  if (data.semester_number !== undefined) {
    fields.push('semester_number = ?');
    params.push(data.semester_number);
  }
  if (data.semester_name !== undefined) {
    fields.push('semester_name = ?');
    params.push(data.semester_name);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }

  if (fields.length === 0) return false;
  params.push(id);

  const [result] = await pool.execute(
    `UPDATE semesters SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows > 0;
}

async function deleteSemester(id) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');

  const [result] = await pool.execute('DELETE FROM semesters WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function semesterExists(batchId, semesterNumber, excludeId = null) {
  if (isDbDisabled()) return false;
  const pool = getPool();
  if (!pool) return false;
  let sql = 'SELECT id FROM semesters WHERE batch_id = ? AND semester_number = ?';
  const params = [batchId, semesterNumber];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0;
}

async function getRelatedCounts(semesterId) {
  if (isDbDisabled()) {
    return { subjectsCount: 0, examSessionsCount: 0 };
  }
  const pool = getPool();
  if (!pool) return { subjectsCount: 0, examSessionsCount: 0 };

  const [subjectRows] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM subjects WHERE semester_id = ?',
    [semesterId]
  );
  const [sessionRows] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM exam_sessions WHERE semester_id = ?',
    [semesterId]
  );

  return {
    subjectsCount: Number(subjectRows[0]?.cnt || 0),
    examSessionsCount: Number(sessionRows[0]?.cnt || 0)
  };
}

module.exports = {
  createSemestersTable,
  createSemester,
  getSemestersByBatch,
  getSemesterById,
  updateSemester,
  deleteSemester,
  semesterExists,
  getRelatedCounts
};
