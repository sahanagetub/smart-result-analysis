const { getPool, isDbDisabled } = require('../config/db');

async function createSubjectsTable() {
  if (isDbDisabled()) {
    console.log('Database disabled: skipping subjects table creation.');
    return;
  }
  const pool = getPool();
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS subjects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_code VARCHAR(20) NOT NULL,
        subject_name VARCHAR(100) NOT NULL,
        semester_id INT NOT NULL,
        credits INT NOT NULL DEFAULT 4,
        status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_subject_code (subject_code),
        INDEX idx_semester_id (semester_id),
        CONSTRAINT fk_subjects_semesters FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
        UNIQUE KEY uk_subject_semester (subject_code, semester_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('subjects table ensured.');
  } catch (err) {
    console.error('Failed to create subjects table:', err.message);
  } finally {
    conn.release();
  }
}

async function createSubject(data) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(
    'INSERT INTO subjects (subject_code, subject_name, semester_id, credits, status) VALUES (?, ?, ?, ?, ?)',
    [data.subject_code, data.subject_name, data.semester_id, data.credits, data.status || 'Active']
  );
  return result.insertId;
}

async function getAllSubjects(search = '') {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];
  let sql = `SELECT s.id, s.subject_code, s.subject_name, s.semester_id, s.credits, s.status, s.created_at, s.updated_at,
                    sem.semester_number, sem.semester_name, b.batch_name
             FROM subjects s
             JOIN semesters sem ON s.semester_id = sem.id
             JOIN batches b ON sem.batch_id = b.id`;
  const params = [];
  if (search) {
    sql += ` WHERE s.subject_code LIKE ? OR s.subject_name LIKE ?`;
    params.push('%' + search + '%', '%' + search + '%');
  }
  sql += ` ORDER BY s.created_at DESC`;
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getSubjectById(id) {
  if (isDbDisabled()) return null;
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    'SELECT s.id, s.subject_code, s.subject_name, s.semester_id, s.credits, s.status, s.created_at, s.updated_at FROM subjects s WHERE s.id = ?',
    [id]
  );
  return rows.length ? rows[0] : null;
}

async function updateSubject(id, data) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const fields = [];
  const params = [];
  if (data.subject_code !== undefined) { fields.push('subject_code = ?'); params.push(data.subject_code); }
  if (data.subject_name !== undefined) { fields.push('subject_name = ?'); params.push(data.subject_name); }
  if (data.semester_id !== undefined) { fields.push('semester_id = ?'); params.push(data.semester_id); }
  if (data.credits !== undefined) { fields.push('credits = ?'); params.push(data.credits); }
  if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
  if (fields.length === 0) return false;
  params.push(id);
  const [result] = await pool.execute(`UPDATE subjects SET ${fields.join(', ')} WHERE id = ?`, params);
  return result.affectedRows > 0;
}

async function deleteSubject(id) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(`DELETE FROM subjects WHERE id = ?`, [id]);
  return result.affectedRows > 0;
}

async function getSubjectsBySemester(semesterId) {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];
  const [rows] = await pool.execute(
    'SELECT id, subject_code, subject_name, credits, status FROM subjects WHERE semester_id = ? ORDER BY subject_code',
    [semesterId]
  );
  return rows;
}

module.exports = {
  createSubjectsTable,
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  getSubjectsBySemester
};