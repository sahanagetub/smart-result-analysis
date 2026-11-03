function requireAuth(req, res, next) {
  const user = (req.session && (req.session.user || (req.session.userId ? { username: req.session.userId, role: 'Staff' } : null)));
  if (user) {
    req.user = user;
    return next();
  }
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  return res.redirect('/login.html');
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

module.exports = { requireAuth, requireRole, requireAdmin, requireStaff };
