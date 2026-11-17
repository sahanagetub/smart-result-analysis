const test = require('node:test');
const assert = require('node:assert/strict');
const { columns, migrate } = require('../database/migrations/20261117_add_subject_mark_columns');
const source = require('fs').readFileSync(require.resolve('../database/migrations/20261117_add_subject_mark_columns'), 'utf8');

test('subject compatibility migration adds only the three application-defined missing columns', () => {
  assert.deepEqual(columns, [
    { name: 'max_internal_marks', ddl: 'INT NOT NULL DEFAULT 40' },
    { name: 'max_external_marks', ddl: 'INT NOT NULL DEFAULT 60' },
    { name: 'total_maximum_marks', ddl: 'INT NOT NULL DEFAULT 100' }
  ]);
  assert.match(source, /INFORMATION_SCHEMA\.COLUMNS/);
  assert.match(source, /filter\(\(column\) => !existing\.has/);
  assert.doesNotMatch(source, /\b(DROP|TRUNCATE|DELETE FROM|UPDATE subjects)\b/i);
});

test('migration refuses writes without explicit safe-database opt-in', async () => {
  const previous = { disabled: process.env.DB_DISABLED, nodeEnv: process.env.NODE_ENV, apply: process.env.ALLOW_SUBJECT_SCHEMA_MIGRATION, expected: process.env.EXPECTED_SCHEMA_DATABASE_NAME, db: process.env.DB_NAME };
  try {
    process.env.DB_DISABLED = 'false'; process.env.NODE_ENV = 'development';
    process.env.ALLOW_SUBJECT_SCHEMA_MIGRATION = 'false';
    process.env.EXPECTED_SCHEMA_DATABASE_NAME = 'safe_test'; process.env.DB_NAME = 'safe_test';
    await assert.rejects(migrate({ apply: true }), /ALLOW_SUBJECT_SCHEMA_MIGRATION/);
    process.env.ALLOW_SUBJECT_SCHEMA_MIGRATION = 'true'; process.env.NODE_ENV = 'production';
    await assert.rejects(migrate({ apply: true }), /production/);
  } finally {
    for (const [key, value] of Object.entries({ DB_DISABLED: previous.disabled, NODE_ENV: previous.nodeEnv, ALLOW_SUBJECT_SCHEMA_MIGRATION: previous.apply, EXPECTED_SCHEMA_DATABASE_NAME: previous.expected, DB_NAME: previous.db })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
