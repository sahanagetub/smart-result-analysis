const path = require('path');

function notFoundHandler(req, res, next) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Route not found.' });
  }
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  if (process.env.NODE_ENV === 'production') {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(status).json({ success: false, message: 'Internal server error.' });
    }
    return res.status(status).send('Something went wrong.');
  }
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({ success: false, message: err.message || 'Internal server error.' });
  }
  res.status(status).send(err.message || 'Internal server error.');
}

module.exports = { notFoundHandler, errorHandler };
