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
        staff_code VARCHAR(40) NULL,
        password_hash VARCHAR(255) NOT NULL,
        must_change_password TINYINT(1) NOT NULL DEFAULT 0,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        role ENUM('Admin','Staff') NOT NULL DEFAULT 'Staff',
        status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_status (status),
        UNIQUE KEY uq_users_staff_code (staff_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const [staffCodeColumn] = await conn.execute("SHOW COLUMNS FROM users LIKE 'staff_code'");
    if (!staffCodeColumn.length) {
      await conn.execute('ALTER TABLE users ADD COLUMN staff_code VARCHAR(40) NULL');
    }
    const [staffCodeIndex] = await conn.execute("SHOW INDEX FROM users WHERE Key_name = 'uq_users_staff_code'");
    if (!staffCodeIndex.length) {
      await conn.execute('ALTER TABLE users ADD UNIQUE INDEX uq_users_staff_code (staff_code)');
    }
    const [passwordFlagColumn] = await conn.execute("SHOW COLUMNS FROM users LIKE 'must_change_password'");
    if (!passwordFlagColumn.length) {
      await conn.execute('ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0');
    }
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
    `INSERT INTO users (username, staff_code, password_hash, must_change_password, full_name, email, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.username, data.staff_code || null, data.password_hash, data.must_change_password ? 1 : 0, data.full_name, data.email, data.role, data.status || 'Active']
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
    `SELECT id, username, staff_code, full_name, email, role, status, created_at, updated_at FROM users ORDER BY created_at DESC`
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
    `SELECT id, username, staff_code, full_name, email, role, status, created_at, updated_at FROM users WHERE id = ?`,
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
    `SELECT id, username, password_hash, must_change_password, full_name, email, role, status FROM users WHERE username = ? LIMIT 1`,
    [username]
  );
  return rows.length ? rows[0] : null;
}

function createUserError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertAdminMutationAllowed(target, requesterUsername, activeAdminCount, mutation) {
  if (String(target.username).toLowerCase() === 'admin' && mutation.kind === 'delete') {
    throw createUserError('The bootstrap administrator account is protected.', 409);
  }
  if (String(target.username).toLowerCase() === String(requesterUsername || '').toLowerCase() &&
      (mutation.kind === 'delete' || mutation.data?.role !== undefined || mutation.data?.status !== undefined)) {
    throw createUserError('You cannot delete or change the role/status of your own administrator account.', 409);
  }
  const removesActiveAdmin = target.role === 'Admin' && target.status === 'Active' &&
    (mutation.kind === 'delete' || (mutation.data?.role !== undefined && mutation.data.role !== 'Admin') || mutation.data?.status === 'Inactive');
  if (removesActiveAdmin && activeAdminCount <= 1) {
    throw createUserError('At least one active administrator must remain.', 409);
  }
}

async function withUserMutation(id, requesterUsername, mutate) {
  if (isDbDisabled()) throw createUserError('Database integration is disabled.', 503);
  const pool = getPool();
  if (!pool) throw createUserError('Database pool unavailable.', 503);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [targetRows] = await connection.execute(
      'SELECT id, username, role, status FROM users WHERE id = ? FOR UPDATE', [id]
    );
    const target = targetRows[0];
    if (!target) throw createUserError('User not found.', 404);
    const changesAdminAvailability = target.role === 'Admin' && target.status === 'Active' &&
      (mutate.kind === 'delete' || (mutate.data?.role !== undefined && mutate.data.role !== 'Admin') || mutate.data?.status === 'Inactive');
    let activeAdminCount = 0;
    if (changesAdminAvailability) {
      const [admins] = await connection.execute("SELECT id FROM users WHERE role = 'Admin' AND status = 'Active' FOR UPDATE");
      activeAdminCount = admins.length;
    }
    assertAdminMutationAllowed(target, requesterUsername, activeAdminCount, mutate);

    const result = await mutate.execute(connection, target);
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback(); } catch (rollbackError) { error.rollbackError = rollbackError; }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function updateUser(id, data, requesterUsername) {
  const allowed = ['staff_code', 'full_name', 'email', 'role', 'status', 'password_hash', 'must_change_password'];
  const fields = [];
  const params = [];
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(data[key]); }
  }
  return withUserMutation(id, requesterUsername, {
    kind: 'update', data,
    async execute(connection, target) {
      if (!fields.length) return target;
      params.push(id);
      await connection.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
      return true;
    }
  });
}

async function changeTemporaryPassword(id, passwordHash) {
  if (isDbDisabled()) throw createUserError('Database integration is disabled.', 503);
  const pool = getPool();
  if (!pool) throw createUserError('Database pool unavailable.', 503);
  const [result] = await pool.execute(
    `UPDATE users SET password_hash = ?, must_change_password = 0
     WHERE id = ? AND role = 'Staff' AND must_change_password = 1 AND status = 'Active'`,
    [passwordHash, id]
  );
  return result.affectedRows === 1;
}

async function deleteUser(id, requesterUsername) {
  return withUserMutation(id, requesterUsername, {
    kind: 'delete',
    async execute(connection) {
      const [result] = await connection.execute('DELETE FROM users WHERE id = ?', [id]);
      if (!result.affectedRows) throw createUserError('User not found.', 404);
      return true;
    }
  });
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
  changeTemporaryPassword,
  deleteUser,
  countUsersByRole,
  assertAdminMutationAllowed
};
