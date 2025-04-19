// Simple health check endpoint
module.exports = (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: 'vercel',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
};
