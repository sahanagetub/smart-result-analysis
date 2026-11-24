function requireAuth(req, res, next) {
  const user = (req.session && (req.session.user || (req.session.userId ? { username: req.session.userId, role: 'Staff' } : null)));
  if (user) {
    req.user = user;
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
    const userRole = req.user.role || 'Staff';
    if (!allowedRoles.includes(userRole)) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
      }
      return res.status(403).send('Insufficient permissions.');
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

function protectStaticPage(req, res, next) {
  if (!protectedStaticPages.has(req.path)) return next();
  return requireAuth(req, res, () => {
    if (req.path === '/users.html') return requireAdmin(req, res, next);
    if (req.path === '/result-upload.html' || req.path === '/result-extraction.html') return requireStaff(req, res, next);
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
