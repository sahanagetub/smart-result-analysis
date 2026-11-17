'use strict';

// Additive and repeatable compatibility migration. Default mode is read-only.
// Apply only to a verified non-production database with explicit opt-in.
const { getPool, isDbDisabled } = require('../../config/db');

const columns = [
  { name: 'max_internal_marks', ddl: 'INT NOT NULL DEFAULT 40' },
  { name: 'max_external_marks', ddl: 'INT NOT NULL DEFAULT 60' },
  { name: 'total_maximum_marks', ddl: 'INT NOT NULL DEFAULT 100' }
];

async function migrate({ apply = false } = {}) {
  if (isDbDisabled()) throw new Error('Database integration is disabled; migration not run.');
  if (apply && process.env.NODE_ENV === 'production') throw new Error('Refusing to apply subject schema migration in production.');
  if (apply && process.env.ALLOW_SUBJECT_SCHEMA_MIGRATION !== 'true') throw new Error('Set ALLOW_SUBJECT_SCHEMA_MIGRATION=true to explicitly enable this migration.');
  const expected = String(process.env.EXPECTED_SCHEMA_DATABASE_NAME || '');
  if (!expected || expected !== String(process.env.DB_NAME || '')) throw new Error('EXPECTED_SCHEMA_DATABASE_NAME must exactly match DB_NAME.');

  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const connection = await pool.getConnection();
  try {
    const [dbRows] = await connection.execute('SELECT DATABASE() AS database_name');
    const actual = String(dbRows[0]?.database_name || '');
    if (actual !== expected) throw new Error('Connected database does not match EXPECTED_SCHEMA_DATABASE_NAME.');
    const [found] = await connection.execute(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME IN (?, ?, ?)',
      [actual, 'subjects', ...columns.map((column) => column.name)]
    );
    const existing = new Set(found.map((row) => row.COLUMN_NAME));
    const missing = columns.filter((column) => !existing.has(column.name));
    if (!missing.length) return { database: actual, added: [], applied: apply };
    if (!apply) return { database: actual, added: missing.map((column) => column.name), applied: false };
    for (const column of missing) {
      await connection.execute(`ALTER TABLE subjects ADD COLUMN ${column.name} ${column.ddl}`);
    }
    return { database: actual, added: missing.map((column) => column.name), applied: true };
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrate({ apply: process.argv.includes('--apply') })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(`Subject schema migration stopped: ${error.message}`); process.exitCode = 1; })
    .finally(async () => {
      const pool = getPool();
      if (pool) await pool.end();
    });
}

module.exports = { migrate, columns };
