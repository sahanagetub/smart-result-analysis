function requireAuth(req, res, next) {
  const user = (req.session && (req.session.user || (req.session.userId ? { username: req.session.userId } : null)));
  if (user) {
    req.user = user;
    return next();
  }
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  return res.redirect('/login.html');
}

module.exports = { requireAuth };
