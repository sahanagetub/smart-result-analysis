const { getPool, isDbDisabled } = require('../config/db');

async function createStudentsTable() {
  if (isDbDisabled()) {
    console.log('Database disabled: skipping students table creation.');
    return;
  }
  const pool = getPool();
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usn VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        batch_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_usn (usn),
        INDEX idx_email (email),
        INDEX idx_batch_id (batch_id),
        CONSTRAINT fk_students_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('students table ensured.');
  } catch (err) {
    console.error('Failed to create students table:', err.message);
  } finally {
    conn.release();
  }
}

async function createStudent(data) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(
    `INSERT INTO students (usn, name, email, batch_id) VALUES (?, ?, ?, ?)`,
    [data.usn, data.name, data.email, data.batch_id]
  );
  return result.insertId;
}

async function getStudentsByBatch(batchId, search = '') {
  if (isDbDisabled()) {
    return [];
  }
  const pool = getPool();
  if (!pool) return [];
  let sql = `SELECT id, usn, name, email, batch_id, created_at, updated_at FROM students WHERE batch_id = ?`;
  const params = [batchId];
  if (search) {
    sql += ` AND (usn LIKE ? OR name LIKE ? OR email LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY created_at DESC`;
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getStudentById(id) {
  if (isDbDisabled()) {
    return null;
  }
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT id, usn, name, email, batch_id, created_at, updated_at FROM students WHERE id = ?`,
    [id]
  );
  return rows.length ? rows[0] : null;
}

async function usnExists(usn, excludeId = null) {
  if (isDbDisabled()) {
    return false;
  }
  const pool = getPool();
  if (!pool) return false;
  let sql = `SELECT id FROM students WHERE usn = ?`;
  const params = [usn];
  if (excludeId) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0;
}

async function emailExists(email, excludeId = null) {
  if (isDbDisabled()) {
    return false;
  }
  const pool = getPool();
  if (!pool) return false;
  let sql = `SELECT id FROM students WHERE email = ?`;
  const params = [email];
  if (excludeId) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0;
}

async function getStudentCountsByBatch() {
  if (isDbDisabled()) {
    return {};
  }
  const pool = getPool();
  if (!pool) return {};
  const [rows] = await pool.execute(`
    SELECT batch_id, COUNT(*) AS count FROM students GROUP BY batch_id
  `);
  let result = {};
  rows.forEach((r) => {
    result[r.batch_id] = Number(r.count);
  });
  return result;
}

async function getAllUsns() {
  if (isDbDisabled()) {
    return [];
  }
  const pool = getPool();
  if (!pool) return [];
  const [rows] = await pool.execute(`SELECT usn FROM students`);
  return rows.map((r) => r.usn);
}

async function getAllEmails() {
  if (isDbDisabled()) {
    return [];
  }
  const pool = getPool();
  if (!pool) return [];
  const [rows] = await pool.execute(`SELECT email FROM students`);
  return rows.map((r) => r.email);
}

async function updateStudent(id, data) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');

  // Build update query
  let sql = 'UPDATE students SET ';
  const updates = [];
  const params = [];

  if (data.usn !== undefined) {
    updates.push('usn = ?');
    params.push(data.usn);
  }
  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.email !== undefined) {
    updates.push('email = ?');
    params.push(data.email);
  }
  if (data.batch_id !== undefined) {
    updates.push('batch_id = ?');
    params.push(data.batch_id);
  }
  if (updates.length === 0) {
    throw new Error('No fields to update.');
  }
  params.push(id);

  const [result] = await pool.execute(sql + ' WHERE id = ?', params);

  if (result.affectedRows === 0) {
    return null;
  }

  return getStudentById(id);
}

async function deleteStudent(id) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');

  const [result] = await pool.execute('DELETE FROM students WHERE id = ?', [id]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getStudentById(id);
}

module.exports = {
  createStudentsTable,
  createStudent,
  getStudentsByBatch,
  getStudentById,
  usnExists,
  emailExists,
  getStudentCountsByBatch,
  updateStudent,
  deleteStudent,
  getAllUsns,
  getAllEmails
};