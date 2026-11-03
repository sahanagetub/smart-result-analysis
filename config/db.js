const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;

function isDbDisabled() {
  return String(process.env.DB_DISABLED || '').toLowerCase() === 'true';
}

function createPool() {
  if (isDbDisabled()) {
    return null;
  }
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_result_analysis',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

async function testConnection() {
  if (isDbDisabled()) {
    console.log('Database integration is disabled (DB_DISABLED=true). Skipping MySQL connection test.');
    return false;
  }
  try {
    if (!pool) pool = createPool();
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('MySQL connection established successfully.');
    return true;
  } catch (err) {
    console.error('MySQL connection failed:', err.message);
    return false;
  }
}

function getPool() {
  if (!pool && !isDbDisabled()) {
    pool = createPool();
  }
  return pool;
}

module.exports = { getPool, testConnection, isDbDisabled };
