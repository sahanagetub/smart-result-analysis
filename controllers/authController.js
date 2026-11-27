const bcrypt = require('bcrypt');
const { getPool } = require('../config/db');
const userModel = require('../models/userModel');

function createSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.username;
      req.session.user = {
        id: user.id || null,
        username: user.username,
        displayName: user.displayName || user.username,
        role: user.role || 'clerk',
        mustChangePassword: Boolean(user.mustChangePassword)
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
    const expectedRole = req.body.role;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }
    if (expectedRole !== undefined && !['Admin', 'Staff'].includes(expectedRole)) {
      return res.status(400).json({ success: false, message: 'Choose a valid sign-in role.' });
    }

    // Foundation admin from environment (not hardcoded in source)
    const adminUser = String(process.env.ADMIN_USERNAME || '').trim();
    const adminHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim();
    const adminDisplayName = String(process.env.ADMIN_DISPLAY_NAME || '').trim();
    if (adminUser && username.toLowerCase() === adminUser.toLowerCase()) {
      if (!adminHash || !adminDisplayName) {
        return res.status(503).json({ success: false, message: 'The Admin/Clerk account is not fully configured in the environment.' });
      }
      const ok = await bcrypt.compare(password, adminHash);
      if (ok && (!expectedRole || expectedRole === 'Admin')) {
        await createSession(req, {
          username: adminUser,
          displayName: adminDisplayName,
          role: 'Admin', mustChangePassword: false
        });
        return res.json({ success: true, message: 'Login successful.', redirect: '/dashboard' });
      }
      // Do not fall through to a database account with the same username.
      return res.status(401).json({ success: false, message: 'Invalid username or password for the selected portal.' });
    }

    // Authenticate against MySQL users table
    const pool = getPool();
    if (pool) {
      try {
        const [rows] = await pool.execute(
          'SELECT id, username, password_hash, must_change_password, full_name, email, role, status FROM users WHERE username = ? OR email = ? LIMIT 1',
          [username, username]
        );
        if (rows && rows.length) {
          const user = rows[0];
          // The single administrator is configured through the environment.
          // Database-backed accounts are always Staff, even if a legacy row
          // still has the Admin role value.
          if (user.role !== 'Staff') {
            return res.status(401).json({ success: false, message: 'Invalid username or password for the selected portal.' });
          }
          if (user.status === 'Inactive') {
            return res.status(401).json({ success: false, message: 'Account is inactive. Contact an administrator.' });
          }
          if (expectedRole && user.role !== expectedRole) {
            return res.status(401).json({ success: false, message: 'Invalid username or password for the selected portal.' });
          }
          const ok = await bcrypt.compare(password, user.password_hash);
          if (ok) {
            await createSession(req, {
              username: user.username,
              displayName: user.full_name || user.username,
              role: user.role || 'Staff', id: user.id,
              mustChangePassword: Number(user.must_change_password) === 1
            });
            const mustChangePassword = Number(user.must_change_password) === 1;
            return res.json({
              success: true,
              message: mustChangePassword ? 'Set a new password to finish activating your account.' : 'Login successful.',
              redirect: mustChangePassword ? '/change-password' : '/dashboard'
            });
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

exports.changeFirstLoginPassword = async (req, res) => {
  const user = req.session?.user;
  if (!user || user.role !== 'Staff' || !user.mustChangePassword || !user.id) {
    return res.status(403).json({ success: false, message: 'This password-change flow is not available for the current account.' });
  }
  const password = req.body?.newPassword;
  const confirmation = req.body?.confirmPassword;
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ success: false, message: 'Choose a password between 8 and 128 characters.' });
  }
  if (password !== confirmation) {
    return res.status(400).json({ success: false, message: 'The passwords do not match.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const updated = await userModel.changeTemporaryPassword(user.id, passwordHash);
    if (!updated) {
      return res.status(409).json({ success: false, message: 'This temporary password has already been used. Sign in again.' });
    }
    const cookieName = req.session.cookie?.name || 'sra.sid';
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    res.clearCookie(cookieName);
    res.clearCookie('sra.sid');
    return res.json({
      success: true,
      message: 'Password updated. Sign in again with your new password.',
      redirect: '/login.html?passwordUpdated=1'
    });
  } catch (error) {
    console.error('First-login password update failed:', error.message);
    return res.status(500).json({ success: false, message: 'Could not update the password. Please try again.' });
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
