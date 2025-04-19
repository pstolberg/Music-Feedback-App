// Database connector for serverless functions
const { Pool } = require('pg');

// Create a PostgreSQL connection pool if database URL is available
let pool = null;
let dbEnabled = false;

try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false // Required for Neon connections
      }
    });
    dbEnabled = true;
    console.log('Database connection initialized');
  } else {
    console.log('No DATABASE_URL provided, database features disabled');
  }
} catch (error) {
  console.error('Failed to initialize database connection:', error);
}

// Helper function to execute queries
async function query(text, params) {
  // Skip if database not enabled
  if (!dbEnabled || !pool) {
    console.log('Database query skipped - no connection available');
    return null;
  }
  
  try {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    return null; // Return null instead of throwing to keep app working if DB fails
  }
}

module.exports = {
  query,
  pool,
  isEnabled: () => dbEnabled
};
