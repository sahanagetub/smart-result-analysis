'use strict';

const mysql = require('mysql2/promise');
const REQUIRED_TABLES = Object.freeze(['batches', 'users', 'students', 'semesters', 'exam_sessions', 'subjects', 'results']);

function getBootstrapConfig(env = process.env) {
  const databaseName = String(env.DB_NAME || '').trim();
  const expectedName = String(env.EXPECTED_BOOTSTRAP_DATABASE_NAME || '').trim();
  const host = String(env.DB_HOST || '').trim();
  const user = String(env.DB_USER || '').trim();
  const port = Number(env.DB_PORT || 3306);

  if (String(env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Database bootstrap is disabled in production.');
  }
  if (String(env.DB_DISABLED || '').toLowerCase() === 'true') {
    throw new Error('Database integration is disabled.');
  }
  if (env.ALLOW_DATABASE_BOOTSTRAP !== 'true') {
    throw new Error('Set ALLOW_DATABASE_BOOTSTRAP=true to explicitly allow database initialization.');
  }
  if (!databaseName || databaseName !== expectedName) {
    throw new Error('EXPECTED_BOOTSTRAP_DATABASE_NAME must exactly match DB_NAME.');
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(databaseName)) {
    throw new Error('DB_NAME must be a valid MySQL database identifier.');
  }
  if (!host || !user || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_HOST, DB_USER and a valid DB_PORT are required.');
  }

  return { host, port, user, password: String(env.DB_PASSWORD || ''), databaseName };
}

async function setupDatabase(options = {}) {
  const env = options.env || process.env;
  const config = getBootstrapConfig(env);
  const mysqlClient = options.mysqlClient || mysql;
  const logger = options.logger || console;
  let bootstrapPool;
  let applicationPool;
  const originalDatabaseName = process.env.DB_NAME;

  try {
    logger.log(`Initializing schema for configured database "${config.databaseName}".`);
    bootstrapPool = mysqlClient.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 0
    });
    const connection = await bootstrapPool.getConnection();
    try {
      // The database name is validated as an identifier above; MySQL does not
      // accept a bind parameter for CREATE DATABASE identifiers.
      await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${config.databaseName}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`);
    } finally {
      connection.release();
    }
    await bootstrapPool.end();
    bootstrapPool = null;

    // Reuse the application's canonical, idempotent model initializers so this
    // manual setup cannot drift from the schema used by normal startup.
    process.env.DB_NAME = config.databaseName;
    const initializers = options.initializers || [
      require('./services/batchService').initBatchesTable,
      require('./services/userService').initUsersTable,
      require('./services/studentService').initStudentsTable,
      require('./services/semesterService').initSemestersTable,
      require('./services/examSessionService').initExamSessionsTable,
      require('./services/subjectService').initSubjectsTable,
      require('./services/resultService').initResultsTable
    ];
    for (const initialize of initializers) await initialize();

    applicationPool = options.getApplicationPool
      ? options.getApplicationPool()
      : require('./config/db').getPool();
    if (!applicationPool) throw new Error('Application database pool unavailable after initialization.');
    const [databaseRows] = await applicationPool.execute('SELECT DATABASE() AS database_name');
    if (String(databaseRows[0]?.database_name || '') !== config.databaseName) {
      throw new Error('Connected database does not match the confirmed bootstrap target.');
    }
    const [tableRows] = await applicationPool.execute(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
      [config.databaseName]
    );
    const presentTables = new Set(tableRows.map((row) => row.TABLE_NAME));
    const missingTables = REQUIRED_TABLES.filter((table) => !presentTables.has(table));
    if (missingTables.length) throw new Error(`Database schema is incomplete; missing tables: ${missingTables.join(', ')}.`);
    logger.log('Database schema initialization completed.');
    return { database: config.databaseName, tableInitializers: initializers.length, tables: REQUIRED_TABLES };
  } finally {
    if (bootstrapPool) await bootstrapPool.end();
    if (applicationPool) await applicationPool.end();
    if (originalDatabaseName === undefined) delete process.env.DB_NAME;
    else process.env.DB_NAME = originalDatabaseName;
  }
}

if (require.main === module) {
  require('dotenv').config();
  setupDatabase().catch((error) => {
    console.error(`Database setup stopped: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { getBootstrapConfig, setupDatabase, REQUIRED_TABLES };
