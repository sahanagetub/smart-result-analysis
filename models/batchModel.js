const { getPool, isDbDisabled } = require('../config/db');

async function createBatchesTable() {
  if (isDbDisabled()) {
    console.log('Database disabled: skipping batches table creation.');
    return;
  }
  const pool = getPool();
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS batches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_name VARCHAR(100) NOT NULL UNIQUE,
        start_year YEAR NOT NULL,
        end_year YEAR NOT NULL,
        status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_batch_name (batch_name),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('batches table ensured.');
  } catch (err) {
    console.error('Failed to create batches table:', err.message);
  } finally {
    conn.release();
  }
}

async function createBatch(data) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(
    `INSERT INTO batches (batch_name, start_year, end_year, status) VALUES (?, ?, ?, ?)`,
    [data.batch_name, data.start_year, data.end_year, data.status]
  );
  return result.insertId;
}

async function getAllBatches(search = '') {
  if (isDbDisabled()) {
    return [];
  }
  const pool = getPool();
  if (!pool) return [];
  let sql = `
    SELECT b.id, b.batch_name, b.start_year, b.end_year, b.status, b.created_at, b.updated_at,
           COUNT(s.id) AS student_count
    FROM batches b
    LEFT JOIN students s ON s.batch_id = b.id
  `;
  const params = [];
  if (search) {
    sql += ` WHERE b.batch_name LIKE ?`;
    params.push(`%${search}%`);
  }
  sql += ` GROUP BY b.id, b.batch_name, b.start_year, b.end_year, b.status, b.created_at, b.updated_at ORDER BY b.created_at DESC`;
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getRelatedCounts(batchId) {
  if (isDbDisabled()) {
    return { studentsCount: 0, semestersCount: 0 };
  }
  const pool = getPool();
  if (!pool) return { studentsCount: 0, semestersCount: 0 };

  const [studentRows] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM students WHERE batch_id = ?',
    [batchId]
  );
  const [semesterRows] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM semesters WHERE batch_id = ?',
    [batchId]
  );

  return {
    studentsCount: Number(studentRows[0]?.cnt || 0),
    semestersCount: Number(semesterRows[0]?.cnt || 0)
  };
}

async function getBatchById(id) {
  if (isDbDisabled()) {
    return null;
  }
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT id, batch_name, start_year, end_year, status, created_at, updated_at FROM batches WHERE id = ?`,
    [id]
  );
  return rows.length ? rows[0] : null;
}

async function updateBatch(id, data) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(
    `UPDATE batches SET batch_name = ?, start_year = ?, end_year = ?, status = ? WHERE id = ?`,
    [data.batch_name, data.start_year, data.end_year, data.status, id]
  );
  return result.affectedRows > 0;
}

async function deleteBatch(id) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(`DELETE FROM batches WHERE id = ?`, [id]);
  return result.affectedRows > 0;
}

async function updateBatchStatus(id, status) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(
    `UPDATE batches SET status = ? WHERE id = ?`,
    [status, id]
  );
  return result.affectedRows > 0;
}

async function batchNameExists(batch_name, excludeId = null) {
  if (isDbDisabled()) {
    return false;
  }
  const pool = getPool();
  if (!pool) return false;
  let sql = `SELECT id FROM batches WHERE batch_name = ?`;
  const params = [batch_name];
  if (excludeId) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0;
}

async function getBatchCounts() {
  if (isDbDisabled()) {
    return { total: 0, active: 0, inactive: 0 };
  }
  const pool = getPool();
  if (!pool) return { total: 0, active: 0, inactive: 0 };
  const [rows] = await pool.execute(
    `SELECT status, COUNT(*) AS cnt FROM batches GROUP BY status`
  );
  let total = 0, active = 0, inactive = 0;
  rows.forEach((r) => {
    total += Number(r.cnt);
    if (r.status === 'Active') active = Number(r.cnt);
    if (r.status === 'Inactive') inactive = Number(r.cnt);
  });
  return { total, active, inactive };
}

module.exports = {
  createBatchesTable,
  createBatch,
  getAllBatches,
  getBatchById,
  updateBatch,
  deleteBatch,
  updateBatchStatus,
  batchNameExists,
  getBatchCounts,
  getRelatedCounts
};
