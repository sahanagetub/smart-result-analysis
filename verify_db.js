'use strict';

const mysql = require('mysql2/promise');

function getVerificationConfig(env = process.env) {
  const databaseName = String(env.DB_NAME || '').trim();
  const expectedName = String(env.EXPECTED_SCHEMA_DATABASE_NAME || '').trim();
  const port = Number(env.DB_PORT || 3306);
  if (String(env.DB_DISABLED || '').toLowerCase() === 'true') {
    throw new Error('Database integration is disabled.');
  }
  if (!databaseName || databaseName !== expectedName) {
    throw new Error('EXPECTED_SCHEMA_DATABASE_NAME must exactly match DB_NAME.');
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(databaseName)) {
    throw new Error('DB_NAME must be a valid MySQL database identifier.');
  }
  if (!String(env.DB_HOST || '').trim() || !String(env.DB_USER || '').trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_HOST, DB_USER and a valid DB_PORT are required.');
  }
  return {
    host: String(env.DB_HOST).trim(),
    port,
    user: String(env.DB_USER).trim(),
    password: String(env.DB_PASSWORD || ''),
    database: databaseName
  };
}

async function verifyDatabase(options = {}) {
  const env = options.env || process.env;
  const config = getVerificationConfig(env);
  const mysqlClient = options.mysqlClient || mysql;
  const logger = options.logger || console;
  const pool = mysqlClient.createPool({ ...config, waitForConnections: true, connectionLimit: 2, queueLimit: 0 });
  try {
    const connection = await pool.getConnection();
    try {
      const [databaseRows] = await connection.execute('SELECT DATABASE() AS database_name');
      if (String(databaseRows[0]?.database_name || '') !== config.database) {
        throw new Error('Connected database does not match EXPECTED_SCHEMA_DATABASE_NAME.');
      }
      const [tableRows] = await connection.execute(
        'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
        [config.database]
      );
      const presentTables = new Set(tableRows.map((row) => row.TABLE_NAME));
      const expectedTables = ['batches', 'users', 'students', 'semesters', 'exam_sessions', 'subjects', 'results'];
      const counts = {};
      for (const table of expectedTables) {
        if (!presentTables.has(table)) continue;
        const [rows] = await connection.execute(`SELECT COUNT(*) AS row_count FROM \`${table}\``);
        counts[table] = Number(rows[0]?.row_count) || 0;
      }
      const result = {
        database: config.database,
        tables: [...presentTables].sort(),
        missingExpectedTables: expectedTables.filter((table) => !presentTables.has(table)),
        rowCounts: counts
      };
      logger.log(JSON.stringify(result, null, 2));
      return result;
    } finally {
      connection.release();
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  require('dotenv').config();
  verifyDatabase().catch((error) => {
    console.error(`Database verification stopped: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { getVerificationConfig, verifyDatabase };
