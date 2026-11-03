const { getPool, isDbDisabled } = require('../config/db');

async function createUsersTable() {
  if (isDbDisabled()) {
    console.log('Database disabled: skipping users table creation.');
    return;
  }
  const pool = getPool();
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        role ENUM('Admin','Staff') NOT NULL DEFAULT 'Staff',
        status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('users table ensured.');
  } catch (err) {
    console.error('Failed to create users table:', err.message);
  } finally {
    conn.release();
  }
}

async function createUser(data) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(
    `INSERT INTO users (username, password_hash, full_name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
    [data.username, data.password_hash, data.full_name, data.email, data.role, data.status || 'Active']
  );
  return result.insertId;
}

async function getAllUsers() {
  if (isDbDisabled()) {
    return [];
  }
  const pool = getPool();
  if (!pool) return [];
  const [rows] = await pool.execute(
    `SELECT id, username, full_name, email, role, status, created_at, updated_at FROM users ORDER BY created_at DESC`
  );
  return rows;
}

async function getUserById(id) {
  if (isDbDisabled()) {
    return null;
  }
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT id, username, full_name, email, role, status, created_at, updated_at FROM users WHERE id = ?`,
    [id]
  );
  return rows.length ? rows[0] : null;
}

async function getUserByUsernameOrEmail(username, email) {
  if (isDbDisabled()) {
    return [];
  }
  const pool = getPool();
  if (!pool) return [];
  const [rows] = await pool.execute(
    `SELECT id, username, email FROM users WHERE username = ? OR email = ?`,
    [username, email]
  );
  return rows;
}

async function getUserByUsername(username) {
  if (isDbDisabled()) {
    return null;
  }
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT id, username, password_hash, full_name, email, role, status FROM users WHERE username = ? LIMIT 1`,
    [username]
  );
  return rows.length ? rows[0] : null;
}

async function updateUser(id, data) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const fields = [];
  const params = [];
  if (data.full_name !== undefined) { fields.push('full_name = ?'); params.push(data.full_name); }
  if (data.email !== undefined) { fields.push('email = ?'); params.push(data.email); }
  if (data.role !== undefined) { fields.push('role = ?'); params.push(data.role); }
  if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
  if (fields.length === 0) return false;
  params.push(id);
  const [result] = await pool.execute(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows > 0;
}

async function deleteUser(id) {
  if (isDbDisabled()) {
    throw new Error('Database integration is disabled.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const [result] = await pool.execute(`DELETE FROM users WHERE id = ?`, [id]);
  return result.affectedRows > 0;
}

async function countUsersByRole() {
  if (isDbDisabled()) {
    return { admin: 0, staff: 0, total: 0 };
  }
  const pool = getPool();
  if (!pool) return { admin: 0, staff: 0, total: 0 };
  const [rows] = await pool.execute(
    `SELECT role, COUNT(*) AS cnt FROM users GROUP BY role`
  );
  let admin = 0, staff = 0;
  rows.forEach((r) => {
    if (r.role === 'Admin') admin = Number(r.cnt);
    if (r.role === 'Staff') staff = Number(r.cnt);
  });
  return { admin, staff, total: admin + staff };
}

module.exports = {
  createUsersTable,
  createUser,
  getAllUsers,
  getUserById,
  getUserByUsernameOrEmail,
  getUserByUsername,
  updateUser,
  deleteUser,
  countUsersByRole
};
