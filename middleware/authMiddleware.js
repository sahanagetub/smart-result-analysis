function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  // API requests get JSON 401
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  return res.redirect('/login.html');
}

module.exports = { requireAuth };
