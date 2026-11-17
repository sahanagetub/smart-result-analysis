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
    await conn.execute(`CREATE TABLE IF NOT EXISTS subjects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      semester_id INT NOT NULL,
      subject_code VARCHAR(20) NOT NULL,
      subject_name VARCHAR(100) NOT NULL,
      max_internal_marks INT NOT NULL DEFAULT 40,
      max_external_marks INT NOT NULL DEFAULT 60,
      total_maximum_marks INT NOT NULL DEFAULT 100,
      credits INT NOT NULL DEFAULT 4,
      status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_subject_code (subject_code),
      INDEX idx_semester_id (semester_id),
      CONSTRAINT fk_subjects_semesters FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
      UNIQUE KEY uk_subject_semester (subject_code, semester_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
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

  const semester_id = parseInt(data.semester_id, 10);
  const subject_code = String(data.subject_code).trim().toUpperCase();
  const subject_name = String(data.subject_name).trim();
  const max_internal = data.max_internal_marks !== undefined ? parseInt(data.max_internal_marks, 10) : 40;
  const max_external = data.max_external_marks !== undefined ? parseInt(data.max_external_marks, 10) : 60;
  const total_max = data.total_maximum_marks !== undefined ? parseInt(data.total_maximum_marks, 10) : (max_internal + max_external);
  const credits = data.credits !== undefined ? parseInt(data.credits, 10) : 4;
  const status = data.status || 'Active';

  const [result] = await pool.execute(
    'INSERT INTO subjects (semester_id, subject_code, subject_name, max_internal_marks, max_external_marks, total_maximum_marks, credits, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [semester_id, subject_code, subject_name, max_internal, max_external, total_max, credits, status]
  );
  return result.insertId;
}

async function getAllSubjects(search = '', semesterId = '') {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];

  let sql = `
    SELECT s.id, s.semester_id, s.subject_code, s.subject_name,
           s.max_internal_marks, s.max_external_marks, s.total_maximum_marks,
           s.credits, s.status, s.created_at, s.updated_at,
           sem.semester_number, sem.semester_name,
           b.id AS batch_id, b.batch_name
    FROM subjects s
    JOIN semesters sem ON s.semester_id = sem.id
    JOIN batches b ON sem.batch_id = b.id
  `;
  const conditions = [];
  const params = [];

  if (semesterId) {
    conditions.push('s.semester_id = ?');
    params.push(semesterId);
  }
  if (search) {
    conditions.push('(s.subject_code LIKE ? OR s.subject_name LIKE ? OR sem.semester_name LIKE ? OR b.batch_name LIKE ?)');
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%');
  }
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY sem.semester_number ASC, s.subject_code ASC';

  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getSubjectById(id) {
  if (isDbDisabled()) return null;
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT s.id, s.semester_id, s.subject_code, s.subject_name,
            s.max_internal_marks, s.max_external_marks, s.total_maximum_marks,
            s.credits, s.status, s.created_at, s.updated_at,
            sem.semester_number, sem.semester_name, b.id AS batch_id, b.batch_name
     FROM subjects s
     JOIN semesters sem ON s.semester_id = sem.id
     JOIN batches b ON sem.batch_id = b.id
     WHERE s.id = ?`,
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

  if (data.semester_id !== undefined) {
    fields.push('semester_id = ?');
    params.push(parseInt(data.semester_id, 10));
  }
  if (data.subject_code !== undefined) {
    fields.push('subject_code = ?');
    params.push(String(data.subject_code).trim().toUpperCase());
  }
  if (data.subject_name !== undefined) {
    fields.push('subject_name = ?');
    params.push(String(data.subject_name).trim());
  }
  if (data.max_internal_marks !== undefined) {
    fields.push('max_internal_marks = ?');
    params.push(parseInt(data.max_internal_marks, 10));
  }
  if (data.max_external_marks !== undefined) {
    fields.push('max_external_marks = ?');
    params.push(parseInt(data.max_external_marks, 10));
  }
  if (data.total_maximum_marks !== undefined) {
    fields.push('total_maximum_marks = ?');
    params.push(parseInt(data.total_maximum_marks, 10));
  }
  if (data.credits !== undefined) {
    fields.push('credits = ?');
    params.push(parseInt(data.credits, 10));
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }

  if (fields.length === 0) return false;
  params.push(id);

  const [result] = await pool.execute(`UPDATE subjects SET ${fields.join(', ')} WHERE id = ?`, params);
  return result.affectedRows > 0;
}

async function deleteSubject(id) {
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');

  const [result] = await pool.execute('DELETE FROM subjects WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function getSubjectsBySemester(semesterId) {
  return getAllSubjects('', semesterId);
}

async function checkSubjectCodeExists(semesterId, subjectCode, excludeId = null) {
  if (isDbDisabled()) return false;
  const pool = getPool();
  if (!pool) return false;

  let sql = 'SELECT id FROM subjects WHERE semester_id = ? AND subject_code = ?';
  const params = [semesterId, String(subjectCode).trim().toUpperCase()];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0;
}

async function countResultsForSubject(subjectCode) {
  if (isDbDisabled()) return 0;
  const pool = getPool();
  if (!pool) return 0;

  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM results WHERE subject_code = ?',
    [subjectCode]
  );
  return Number(rows[0]?.cnt || 0);
}

async function getSubjectsCount(search = '') {
  if (isDbDisabled()) return { total: 0, active: 0, inactive: 0 };
  const pool = getPool();
  if (!pool) return { total: 0, active: 0, inactive: 0 };

  let sql = `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active,
                    SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) AS inactive
             FROM subjects`;
  const params = [];
  if (search) {
    sql += ' WHERE subject_code LIKE ? OR subject_name LIKE ?';
    params.push('%' + search + '%', '%' + search + '%');
  }
  const [rows] = await pool.execute(sql, params);
  return {
    total: Number(rows[0]?.total || 0),
    active: Number(rows[0]?.active || 0),
    inactive: Number(rows[0]?.inactive || 0)
  };
}

module.exports = {
  createSubjectsTable,
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  getSubjectsBySemester,
  checkSubjectCodeExists,
  countResultsForSubject,
  getSubjectsCount
};
