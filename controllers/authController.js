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
          role: 'clerk'
        });
        return res.json({ success: true, message: 'Login successful.', redirect: '/dashboard.html' });
      }
    }

    // Future: authenticate against MySQL users table when available
    const pool = getPool();
    if (pool) {
      try {
        const [rows] = await pool.execute(
          'SELECT id, username, password_hash, display_name, role FROM users WHERE username = ? OR email = ? LIMIT 1',
          [username, username]
        );
        if (rows && rows.length) {
          const user = rows[0];
          const ok = await bcrypt.compare(password, user.password_hash);
          if (ok) {
            await createSession(req, {
              username: user.username,
              displayName: user.display_name || user.username,
              role: user.role || 'clerk'
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
