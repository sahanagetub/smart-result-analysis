const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { csrfMiddleware, protectStaticPage } = require('../middleware/authMiddleware');
const fs = require('node:fs');
const path = require('node:path');

function checkCsrf({ method = 'POST', requestToken, sessionToken, url = '/api/test' } = {}) {
  return new Promise((resolve) => {
    const req = {
      method, originalUrl: url, body: {}, query: {}, headers: {},
      session: sessionToken ? { _csrf: sessionToken } : {},
      app: { get: () => false }
    };
    if (requestToken) req.headers['x-csrf-token'] = requestToken;
    let nextCalled = false;
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body, nextCalled }); } };
    csrfMiddleware(req, res, () => { nextCalled = true; resolve({ status: 200, nextCalled }); });
  });
}

test('CSRF requires an existing matching session token and retains safe GET exemptions', async () => {
  assert.equal((await checkCsrf({ requestToken: 'attacker-chosen' })).status, 400);
  assert.equal((await checkCsrf({ sessionToken: 'session-token' })).status, 400);
  assert.equal((await checkCsrf({ requestToken: 'wrong', sessionToken: 'session-token' })).status, 400);
  assert.deepEqual(await checkCsrf({ requestToken: 'session-token', sessionToken: 'session-token' }), { status: 200, nextCalled: true });
  assert.deepEqual(await checkCsrf({ method: 'GET' }), { status: 200, nextCalled: true });
});

test('static application pages require a session and user management requires an admin role', () => {
  function check(path, user) {
    let nextCalled = false;
    const req = { path, originalUrl: path, session: user ? { user } : undefined };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, redirect(location) { this.statusCode = 302; this.location = location; return this; }, send(body) { this.body = body; return this; } };
    protectStaticPage(req, res, () => { nextCalled = true; });
    return { status: res.statusCode, location: res.location, body: res.body, nextCalled };
  }
  assert.deepEqual(check('/dashboard.html'), { status: 302, location: '/login', body: undefined, nextCalled: false });
  assert.equal(check('/dashboard.html', { role: 'Staff' }).nextCalled, true);
  assert.equal(check('/users.html', { role: 'Staff' }).status, 403);
  assert.equal(check('/users.html', { role: 'Admin' }).nextCalled, true);
  assert.equal(check('/login.html').nextCalled, true);
});

test('production app refuses a missing session secret', () => {
  const result = spawnSync(process.execPath, ['-e', "process.env.NODE_ENV='production';process.env.SESSION_SECRET='';require('./app')"], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: '' }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production startup requires a unique SESSION_SECRET/);
});

test('production app refuses long but repetitive session secrets', () => {
  const result = spawnSync(process.execPath, ['-e', "process.env.NODE_ENV='production';process.env.SESSION_SECRET='a'.repeat(64);require('./app')"], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: 'a'.repeat(64) }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production startup requires a unique SESSION_SECRET/);
});

test('shared sidebar logout uses the CSRF-aware client handler', () => {
  const sidebar = fs.readFileSync(path.join(process.cwd(), 'views', 'partials', 'sidebar.ejs'), 'utf8');
  const main = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'main.js'), 'utf8');
  assert.match(sidebar, /id="sidebarLogoutForm"/);
  assert.doesNotMatch(sidebar, /onsubmit=/);
  assert.match(main, /sidebarLogoutForm\.addEventListener\('submit', logout\)/);
  assert.match(main, /fetch\('\/api\/auth\/csrf'/);
  assert.match(main, /'x-csrf-token': csrf\.csrfToken/);
});
