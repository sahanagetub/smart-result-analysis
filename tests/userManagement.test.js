const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const http = require('node:http');
const service = require('../services/userService');
const model = require('../models/userModel');
const controller = require('../controllers/userController');
const { csrfMiddleware } = require('../middleware/authMiddleware');

test('user creation validates fields and stores a bcrypt hash', async (t) => {
  const old = { existing: model.getUserByUsernameOrEmail, create: model.createUser };
  t.after(() => { model.getUserByUsernameOrEmail = old.existing; model.createUser = old.create; });
  let inserted;
  model.getUserByUsernameOrEmail = async () => [];
  model.createUser = async (data) => { inserted = data; return 7; };
  assert.equal(await service.createUserService({ username: 'staff1', full_name: 'Staff One', email: 'S@EXAMPLE.COM', password: 'secret1' }, 'Admin'), 7);
  assert.notEqual(inserted.password_hash, 'secret1');
  assert.equal(await bcrypt.compare('secret1', inserted.password_hash), true);
  assert.equal(inserted.email, 's@example.com');
  await assert.rejects(service.createUserService({ username: '', password: 'secret1' }, 'Admin'), { status: 400 });
  await assert.rejects(service.createUserService({ username: 'x', full_name: 'X', email: 'x@x.com', password: 'secret1' }, 'Staff'), { status: 403 });
});

test('user list and mutations are admin-only and validate identifiers', async () => {
  await assert.rejects(service.listUsersService('Staff'), { status: 403 });
  await assert.rejects(service.updateUserService('1 OR 1=1', { full_name: 'Bad' }, 'Admin'), { status: 400 });
  await assert.rejects(service.getUserService('0', 'Admin'), { status: 400 });
});

test('controller list response is JSON-safe and omits authentication fields', async () => {
  const old = { list: model.getAllUsers, counts: model.countUsersByRole };
  model.getAllUsers = async () => [{ id: 1, username: 'staff', password_hash: 'secret-hash', role: 'Staff' }];
  model.countUsersByRole = async () => ({ admin: 1, staff: 1, total: 2 });
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.listUsers({ session: { user: { role: 'Admin' } } }, res, (err) => { throw err; });
  assert.deepEqual(res.body.counts, { admin: 1, staff: 1, total: 2 });
  assert.equal('password_hash' in res.body.data[0], false);
  model.getAllUsers = old.list; model.countUsersByRole = old.counts;
});

test('CSRF middleware rejects missing and mismatched tokens for state changes', async () => {
  async function check(token) {
    let called = false;
    const req = { method: 'DELETE', originalUrl: '/api/auth/users/2', body: {}, query: {}, headers: token ? { 'x-csrf-token': token } : {}, session: { _csrf: 'bound-token' }, app: { get: () => false } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    csrfMiddleware(req, res, () => { called = true; });
    return { status: res.statusCode, called };
  }
  assert.deepEqual(await check(), { status: 400, called: false });
  assert.deepEqual(await check('wrong'), { status: 400, called: false });
  assert.deepEqual(await check('bound-token'), { status: 200, called: true });
});

test('user routes expose list, update and delete behind admin and CSRF middleware', () => {
  const router = require('../routes/authRoutes');
  const find = (method, path) => router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  for (const [method, path] of [['get', '/users'], ['put', '/users/:id'], ['delete', '/users/:id']]) {
    const route = find(method, path);
    assert.ok(route, `${method.toUpperCase()} ${path} is registered`);
    assert.ok(route.route.stack.length >= (method === 'get' ? 3 : 4));
  }
});

test('admin changes cannot self-disable or remove the last active administrator', () => {
  const { assertAdminMutationAllowed } = model;
  assert.throws(() => assertAdminMutationAllowed({ username: 'root', role: 'Admin', status: 'Active' }, 'ROOT', 1, { kind: 'delete' }), { status: 409 });
  assert.throws(() => assertAdminMutationAllowed({ username: 'admin2', role: 'Admin', status: 'Active' }, 'other', 1, { kind: 'update', data: { status: 'Inactive' } }), { status: 409 });
  assert.doesNotThrow(() => assertAdminMutationAllowed({ username: 'admin2', role: 'Admin', status: 'Active' }, 'other', 2, { kind: 'update', data: { status: 'Inactive' } }));
});

test('user management HTTP endpoints enforce admin and CSRF and return JSON responses', async (t) => {
  const originals = {
    create: service.createUserService, get: service.getUserService, list: service.listUsersService,
    count: service.countUsersService, update: service.updateUserService, remove: service.deleteUserService
  };
  service.createUserService = async () => 12;
  service.getUserService = async () => ({ id: 12, username: 'new', full_name: 'New User' });
  service.listUsersService = async () => [{ id: 12, username: 'new', full_name: 'New User' }];
  service.countUsersService = async () => ({ admin: 1, staff: 1, total: 2 });
  service.updateUserService = async (id, data) => ({ id: Number(id), full_name: data.full_name });
  service.deleteUserService = async () => true;
  t.after(() => Object.assign(service, {
    createUserService: originals.create, getUserService: originals.get, listUsersService: originals.list,
    countUsersService: originals.count, updateUserService: originals.update, deleteUserService: originals.remove
  }));

  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'user-management-test-secret', resave: false, saveUninitialized: true }));
  app.use((req, _res, next) => {
    if (req.headers['x-test-role']) req.session.user = { username: req.headers['x-test-user'] || 'root', role: req.headers['x-test-role'] };
    req.session._csrf = 'csrf-test-token';
    next();
  });
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ success: false, message: err.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  function call(method, path, role, token, data) {
    return new Promise((resolve, reject) => {
      const body = data === undefined ? '' : JSON.stringify(data);
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: `/api/auth${path}`, method,
        headers: { ...(role ? { 'x-test-role': role } : {}), ...(token ? { 'x-csrf-token': token } : {}), ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}) }
      }, (res) => { let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => text += chunk); res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} })); });
      req.on('error', reject); if (body) req.write(body); req.end();
    });
  }
  assert.equal((await call('GET', '/users')).status, 401);
  assert.equal((await call('GET', '/users', 'Staff')).status, 403);
  assert.equal((await call('GET', '/users', 'Admin')).body.data.length, 1);
  assert.equal((await call('PUT', '/users/12', 'Admin', null, { full_name: 'Edit' })).status, 400);
  assert.equal((await call('PUT', '/users/12', 'Admin', 'csrf-test-token', { full_name: 'Edit' })).body.data.full_name, 'Edit');
  assert.equal((await call('DELETE', '/users/12', 'Admin', 'csrf-test-token')).body.success, true);
  assert.equal((await call('POST', '/users', 'Admin', 'csrf-test-token', { username: 'new', full_name: 'New User', email: 'new@example.com', password: 'secret1' })).status, 201);
});
