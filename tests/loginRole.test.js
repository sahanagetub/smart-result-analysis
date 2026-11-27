'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

test('database Staff accounts cannot authenticate through the Admin portal', async (t) => {
  const dbPath = require.resolve('../config/db');
  const controllerPath = require.resolve('../controllers/authController');
  const originalDb = require(dbPath);
  const staffHash = await bcrypt.hash('staff-test-password', 4);
  let accountRole = 'Staff';
  let mustChangePassword = 1;
  require.cache[dbPath].exports = {
    ...originalDb,
    getPool: () => ({ execute: async () => [[{
      id: 7, username: 'staff-login-test', password_hash: staffHash,
      must_change_password: mustChangePassword,
      full_name: 'Staff Test', get role() { return accountRole; }, status: 'Active'
    }]] })
  };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  t.after(() => {
    require.cache[dbPath].exports = originalDb;
    delete require.cache[controllerPath];
  });

  async function login(role) {
    const req = { body: { username: 'staff-login-test', password: 'staff-test-password', role }, session: {
      regenerate(callback) { callback(); }, save(callback) { callback(); }
    } };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await controller.login(req, res);
    return { status: res.statusCode, body: res.body, user: req.session.user };
  }

  const wrongPortal = await login('Admin');
  assert.equal(wrongPortal.status, 401);
  assert.equal(wrongPortal.user, undefined);
  const correctPortal = await login('Staff');
  assert.equal(correctPortal.status, 200);
  assert.equal(correctPortal.user.role, 'Staff');
  assert.equal(correctPortal.user.mustChangePassword, true);
  assert.equal(correctPortal.body.redirect, '/change-password');
  mustChangePassword = 0;
  const returningStaff = await login('Staff');
  assert.equal(returningStaff.body.redirect, '/dashboard');
  assert.equal(returningStaff.user.mustChangePassword, false);
  accountRole = 'Admin';
  const databaseAdmin = await login('Admin');
  assert.equal(databaseAdmin.status, 401, 'Only the configured Admin/Clerk may authenticate as Admin.');
});
