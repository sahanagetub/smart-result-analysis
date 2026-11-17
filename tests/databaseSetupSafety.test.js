'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getBootstrapConfig, setupDatabase, REQUIRED_TABLES } = require('../init_db');
const { getVerificationConfig, verifyDatabase } = require('../verify_db');

const bootstrapEnv = (overrides = {}) => ({
  NODE_ENV: 'test', DB_DISABLED: 'false', ALLOW_DATABASE_BOOTSTRAP: 'true',
  DB_HOST: '127.0.0.1', DB_PORT: '3307', DB_USER: 'test_user', DB_PASSWORD: 'test-only',
  DB_NAME: 'sras_disposable_test', EXPECTED_BOOTSTRAP_DATABASE_NAME: 'sras_disposable_test', ...overrides
});

const verificationEnv = (overrides = {}) => ({
  DB_DISABLED: 'false', DB_HOST: '127.0.0.1', DB_PORT: '3307', DB_USER: 'test_user',
  DB_PASSWORD: 'test-only', DB_NAME: 'sras_disposable_test',
  EXPECTED_SCHEMA_DATABASE_NAME: 'sras_disposable_test', ...overrides
});

test('database bootstrap requires explicit non-production opt-in and exact target confirmation', () => {
  assert.throws(() => getBootstrapConfig(bootstrapEnv({ ALLOW_DATABASE_BOOTSTRAP: 'false' })), /explicitly allow/);
  assert.throws(() => getBootstrapConfig(bootstrapEnv({ NODE_ENV: 'production' })), /disabled in production/);
  assert.throws(() => getBootstrapConfig(bootstrapEnv({ EXPECTED_BOOTSTRAP_DATABASE_NAME: 'another_db' })), /exactly match/);
  assert.throws(() => getBootstrapConfig(bootstrapEnv({ DB_NAME: 'bad-name', EXPECTED_BOOTSTRAP_DATABASE_NAME: 'bad-name' })), /valid MySQL database identifier/);
  assert.equal(getBootstrapConfig(bootstrapEnv()).password, 'test-only');
});

test('database bootstrap uses only the confirmed name and canonical initializers when explicitly opted in', async () => {
  const executed = [];
  let closed = false;
  const mysqlClient = { createPool(config) {
    assert.equal(config.database, undefined);
    assert.equal(config.password, 'test-only');
    return {
      async getConnection() {
        return { async execute(sql) { executed.push(sql); return [{ affectedRows: 0 }]; }, release() {} };
      },
      async end() { closed = true; }
    };
  } };
  let initialized = 0;
  const initializers = [async () => { initialized += 1; }, async () => { initialized += 1; }];
  const appPool = {
    async execute(sql) {
      if (sql.startsWith('SELECT DATABASE()')) return [[{ database_name: 'sras_disposable_test' }]];
      if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [REQUIRED_TABLES.map((TABLE_NAME) => ({ TABLE_NAME }))];
      throw new Error(`Unexpected application verification query: ${sql}`);
    },
    async end() {}
  };
  const result = await setupDatabase({
    env: bootstrapEnv(), mysqlClient, initializers, getApplicationPool: () => appPool,
    logger: { log() {} }
  });
  assert.equal(result.database, 'sras_disposable_test');
  assert.equal(result.tableInitializers, 2);
  assert.deepEqual(result.tables, REQUIRED_TABLES);
  assert.equal(initialized, 2);
  assert.equal(closed, true);
  assert.equal(executed.length, 1);
  assert.match(executed[0], /^CREATE DATABASE IF NOT EXISTS `sras_disposable_test`/);
  assert.doesNotMatch(executed.join('\n'), /DROP|TRUNCATE|DELETE/i);
});

test('database bootstrap fails when an initializer leaves required tables missing', async () => {
  let applicationPoolClosed = false;
  const mysqlClient = { createPool() {
    return {
      async getConnection() {
        return { async execute() { return [{ affectedRows: 0 }]; }, release() {} };
      },
      async end() {}
    };
  } };
  const applicationPool = {
    async execute(sql) {
      if (sql.startsWith('SELECT DATABASE()')) return [[{ database_name: 'sras_disposable_test' }]];
      return [[{ TABLE_NAME: 'batches' }]];
    },
    async end() { applicationPoolClosed = true; }
  };
  await assert.rejects(setupDatabase({
    env: bootstrapEnv(), mysqlClient, initializers: [async () => {}],
    getApplicationPool: () => applicationPool, logger: { log() {} }
  }), /schema is incomplete; missing tables/);
  assert.equal(applicationPoolClosed, true);
});

test('database verification requires exact target confirmation before opening a pool', async () => {
  assert.throws(() => getVerificationConfig(verificationEnv({ DB_DISABLED: 'true' })), /disabled/);
  assert.throws(() => getVerificationConfig(verificationEnv({ EXPECTED_SCHEMA_DATABASE_NAME: 'other_db' })), /exactly match/);
  let poolCreated = false;
  await assert.rejects(verifyDatabase({
    env: verificationEnv({ EXPECTED_SCHEMA_DATABASE_NAME: 'other_db' }),
    mysqlClient: { createPool() { poolCreated = true; } }
  }), /exactly match/);
  assert.equal(poolCreated, false);
});

test('database verification checks the connected database and emits counts without student records', async () => {
  const queries = [];
  let released = false;
  let closed = false;
  const pool = {
    async getConnection() {
      return {
        async execute(sql, params = []) {
          queries.push({ sql, params });
          if (sql.startsWith('SELECT DATABASE()')) return [[{ database_name: 'sras_disposable_test' }]];
          if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [[{ TABLE_NAME: 'students' }, { TABLE_NAME: 'batches' }]];
          if (sql.includes('COUNT(*)')) return [[{ row_count: 3 }]];
          throw new Error(`Unexpected read query: ${sql}`);
        },
        release() { released = true; }
      };
    },
    async end() { closed = true; }
  };
  const output = [];
  const result = await verifyDatabase({ env: verificationEnv(), mysqlClient: { createPool() { return pool; } }, logger: { log(value) { output.push(value); } } });
  assert.deepEqual(result.missingExpectedTables, ['users', 'semesters', 'exam_sessions', 'subjects', 'results']);
  assert.deepEqual(result.rowCounts, { batches: 3, students: 3 });
  assert.equal(output.length, 1);
  assert.doesNotMatch(output[0], /usn|email|studentName|password_hash/i);
  assert.ok(queries.every(({ sql }) => /^SELECT\b/i.test(sql)));
  assert.equal(released, true);
  assert.equal(closed, true);
});

test('database verification refuses a mismatched connected schema', async () => {
  const pool = {
    async getConnection() { return { async execute() { return [[{ database_name: 'unexpected_database' }]]; }, release() {} }; },
    async end() {}
  };
  await assert.rejects(verifyDatabase({ env: verificationEnv(), mysqlClient: { createPool() { return pool; } }, logger: { log() {} } }), /does not match/);
});
