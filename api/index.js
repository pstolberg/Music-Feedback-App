// Serverless entry point for Vercel deployment
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists for serverless environment
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Import the server code but don't start it automatically
const app = require('../server/server');

// Export the Express API for Vercel
module.exports = app;
