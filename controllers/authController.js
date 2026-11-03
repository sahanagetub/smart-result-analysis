const bcrypt = require('bcrypt');
const { getPool } = require('../config/db');

function createSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.username;
      req.session.user = {
        username: user.username,
        displayName: user.displayName || user.username,
        role: user.role || 'clerk'
      };
      req.session.save((err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });
}

exports.login = async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    // Foundation admin from environment (not hardcoded in source)
    const adminUser = process.env.ADMIN_USERNAME;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    if (adminUser && adminHash && username === adminUser) {
      const ok = await bcrypt.compare(password, adminHash);
      if (ok) {
        await createSession(req, {
          username: adminUser,
          displayName: process.env.ADMIN_DISPLAY_NAME || adminUser,
          role: 'Admin'
        });
        return res.json({ success: true, message: 'Login successful.', redirect: '/dashboard.html' });
      }
    }

    // Authenticate against MySQL users table
    const pool = getPool();
    if (pool) {
      try {
        const [rows] = await pool.execute(
          'SELECT id, username, password_hash, display_name, role, status FROM users WHERE username = ? OR email = ? LIMIT 1',
          [username, username]
        );
        if (rows && rows.length) {
          const user = rows[0];
          if (user.status === 'Inactive') {
            return res.status(401).json({ success: false, message: 'Account is inactive. Contact an administrator.' });
          }
          const ok = await bcrypt.compare(password, user.password_hash);
          if (ok) {
            await createSession(req, {
              username: user.username,
              displayName: user.full_name || user.username,
              role: user.role || 'Staff'
            });
            return res.json({ success: true, message: 'Login successful.', redirect: '/dashboard.html' });
          }
        }
      } catch (e) {
        // users table may not exist yet; ignore and fall through
      }
    }

    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

exports.logout = (req, res) => {
  const cookieName = (req.session && req.session.cookie && req.session.cookie.name) || 'sra.sid';
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.clearCookie(cookieName);
    res.clearCookie('sra.sid');
    res.json({ success: true, message: 'Logged out.', redirect: '/login.html' });
  });
};

exports.me = (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ success: true, data: req.session.user });
  }
  if (req.session && req.session.userId) {
    return res.json({ success: true, data: { username: req.session.userId, displayName: req.session.userId, role: 'clerk' } });
  }
  return res.status(401).json({ success: false, message: 'Not authenticated.' });
};

exports.createUser = async (req, res, next) => {
  try {
    const { username, password, full_name, email, role, status } = req.body;

    if (!username || !password || !full_name || !email) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (!['Admin', 'Staff'].includes(role || 'Staff')) {
      return res.status(400).json({ success: false, message: 'Role must be Admin or Staff.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const requesterRole = (req.session && req.session.user && req.session.user.role) || 'Staff';
    if (requesterRole !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can create user accounts.' });
    }

    // Check uniqueness
    const pool = getPool();
    if (pool) {
      try {
        const [existing] = await pool.execute(
          'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
          [username, email]
        );
        if (existing && existing.length) {
          return res.status(409).json({ success: false, message: 'Username or email already exists.' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
          `INSERT INTO users (username, password_hash, full_name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
          [username, password_hash, full_name, email, role || 'Staff', status || 'Active']
        );
        const user = {
          id: result.insertId,
          username,
          full_name,
          email,
          role: role || 'Staff',
          status: status || 'Active'
        };
        return res.status(201).json({ success: true, data: user, message: 'User created successfully.' });
      } catch (e) {
        console.error('Create user error:', e);
        return res.status(500).json({ success: false, message: 'Failed to create user.' });
      }
    }

    return res.status(500).json({ success: false, message: 'Database integration is disabled.' });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
};
