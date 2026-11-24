'use strict';

// Adds the database-level duplicate guard required by result uploads.
// Preview mode is read-only; applying requires the exact target database name.
const { getPool, isDbDisabled } = require('../../config/db');

async function migrate({ apply = false } = {}) {
  if (isDbDisabled()) throw new Error('Database integration is disabled; migration not run.');
  if (apply && process.env.NODE_ENV === 'production') throw new Error('Refusing to apply result upload migration in production.');
  if (apply && process.env.ALLOW_RESULT_UPLOAD_SCHEMA_MIGRATION !== 'true') {
    throw new Error('Set ALLOW_RESULT_UPLOAD_SCHEMA_MIGRATION=true to explicitly enable this migration.');
  }
  const expected = String(process.env.EXPECTED_SCHEMA_DATABASE_NAME || '');
  if (!expected || expected !== String(process.env.DB_NAME || '')) {
    throw new Error('EXPECTED_SCHEMA_DATABASE_NAME must exactly match DB_NAME.');
  }
  const pool = getPool();
  if (!pool) throw new Error('Database pool unavailable.');
  const connection = await pool.getConnection();
  try {
    const [dbRows] = await connection.execute('SELECT DATABASE() AS database_name');
    const actual = String(dbRows[0]?.database_name || '');
    if (actual !== expected) throw new Error('Connected database does not match EXPECTED_SCHEMA_DATABASE_NAME.');
    const [indexes] = await connection.execute(
      'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
      [actual, 'results', 'uk_results_student_subject_session']
    );
    if (indexes.length) return { database: actual, applied: false, alreadyPresent: true, duplicateGroups: 0 };
    const [duplicates] = await connection.execute(`SELECT usn, subject_code, exam_session_id, COUNT(*) AS count
      FROM results GROUP BY usn, subject_code, exam_session_id HAVING COUNT(*) > 1 LIMIT 20`);
    if (duplicates.length) throw new Error('Found existing duplicate result keys; inspect and resolve them manually before applying this migration. No result data was changed.');
    if (!apply) return { database: actual, applied: false, alreadyPresent: false, duplicateGroups: 0 };
    await connection.execute('ALTER TABLE results ADD CONSTRAINT uk_results_student_subject_session UNIQUE (usn, subject_code, exam_session_id)');
    return { database: actual, applied: true, alreadyPresent: false, duplicateGroups: 0 };
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrate({ apply: process.argv.includes('--apply') })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(`Result upload migration stopped: ${error.message}`); process.exitCode = 1; })
    .finally(async () => { const pool = getPool(); if (pool) await pool.end(); });
}

module.exports = { migrate };
