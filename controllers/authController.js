const bcrypt = require('bcrypt');
const { getPool } = require('../config/db');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Foundation admin from environment (not hardcoded in source)
    const adminUser = process.env.ADMIN_USERNAME;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    if (adminUser && adminHash && username === adminUser) {
      const ok = await bcrypt.compare(password, adminHash);
      if (ok) {
        req.session.userId = username;
        req.session.role = 'admin';
        return res.json({ success: true, message: 'Login successful.', redirect: '/dashboard.html' });
      }
    }

    // Future: authenticate against MySQL users table when available
    const pool = getPool();
    if (pool) {
      try {
        const [rows] = await pool.execute(
          'SELECT id, username, password_hash, role FROM users WHERE username = ? LIMIT 1',
          [username]
        );
        if (rows && rows.length) {
          const user = rows[0];
          const ok = await bcrypt.compare(password, user.password_hash);
          if (ok) {
            req.session.userId = user.username;
            req.session.role = user.role || 'user';
            return res.json({ success: true, message: 'Login successful.', redirect: '/dashboard.html' });
          }
        }
      } catch (e) {
        // users table may not exist yet; ignore and fall through
      }
    }

    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sra.sid');
    res.json({ success: true, message: 'Logged out.', redirect: '/login.html' });
  });
};

exports.me = (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ success: true, data: { username: req.session.userId, role: req.session.role } });
  }
  return res.status(401).json({ success: false, message: 'Not authenticated.' });
};
