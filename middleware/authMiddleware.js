function requireAuth(req, res, next) {
  const user = (req.session && (req.session.user || (req.session.userId ? { username: req.session.userId, role: 'Staff' } : null)));
  if (user) {
    req.user = user;
    if (user.mustChangePassword) {
      const requestPath = (req.originalUrl || req.path).split('?')[0];
      const allowedApi = (req.method === 'GET' && ['/api/auth/me', '/api/auth/csrf'].includes(requestPath)) ||
        (req.method === 'POST' && ['/api/auth/first-login-password', '/api/auth/logout'].includes(requestPath));
      if (allowedApi || (req.method === 'GET' && requestPath === '/change-password')) return next();
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({
          success: false, passwordChangeRequired: true,
          message: 'Update your temporary password before continuing.', redirect: '/change-password'
        });
      }
      return res.redirect('/change-password');
    }
    return next();
  }
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  return res.redirect('/login');
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }
      return res.redirect('/login.html');
    }
    const userRole = String(req.user.role || 'Staff').toLowerCase();
    const allowed = allowedRoles.some((role) => role.toLowerCase() === userRole);
    if (!allowed) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
      }
      const active = req.path.startsWith('/batches') ? 'batches'
        : req.path.startsWith('/students') ? 'students'
          : req.path.startsWith('/semesters') ? 'semesters'
            : req.path.startsWith('/sessions') ? 'sessions'
              : req.path.startsWith('/subjects') ? 'subjects'
                : 'users';
      const denied = res.status(403);
      if (typeof denied.render !== 'function') return denied.send('Insufficient permissions.');
      return denied.render('errors/unauthorized', {
        title: 'Access restricted', active,
        message: 'Your Staff account can access Dashboard and Results & insights. This page is reserved for administrators.'
      });
    }
    next();
  };
}

const requireAdmin = requireRole(['Admin']);
const requireStaff = requireRole(['Admin', 'Staff']);

const protectedStaticPages = new Set([
  '/dashboard.html', '/batches.html', '/students.html', '/semesters.html',
  '/sessions.html', '/subjects.html', '/results.html', '/result-upload.html', '/result-extraction.html', '/analytics.html', '/reports.html', '/users.html'
]);
const adminOnlyStaticPages = new Set([
  '/batches.html', '/students.html', '/semesters.html', '/sessions.html', '/subjects.html', '/users.html'
]);

function protectStaticPage(req, res, next) {
  if (!protectedStaticPages.has(req.path)) return next();
  return requireAuth(req, res, () => {
    if (req.path === '/dashboard.html') return res.redirect('/dashboard');
    if (adminOnlyStaticPages.has(req.path)) return requireAdmin(req, res, next);
    if (req.path === '/result-upload.html' || req.path === '/result-extraction.html') return requireAdmin(req, res, next);
    return next();
  });
}

// CSRF protection middleware
function csrfMiddleware(req, res, next) {
  // Skip CSRF check for GET requests, login, logout, me, and health checks
  if (req.method === 'GET' || req.originalUrl.startsWith('/api/auth/login') ||
      req.originalUrl.startsWith('/api/auth/me') ||
      req.originalUrl.startsWith('/api/health')) {
    return next();
  }

  // A request token cannot establish its own session binding.
  const csrfToken = req.body?._csrf || req.query?._csrf || req.headers?.['x-csrf-token'];
  const sessionToken = req.session && req.session._csrf;
  if (!csrfToken || !sessionToken || csrfToken !== sessionToken) {
    return res.status(400).json({ success: false, message: 'Invalid CSRF token.' });
  }

  next();
}

module.exports = { requireAuth, requireRole, requireAdmin, requireStaff, csrfMiddleware, protectStaticPage };
