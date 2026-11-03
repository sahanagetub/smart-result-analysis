exports.check = (req, res) => {
  res.status(200).json({
    status: 'ok',
    application: 'Smart Student Result Analysis and Academic Performance Prediction System',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
};
