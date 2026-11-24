const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcrypt');

process.env.NODE_ENV = 'test';
process.env.DB_DISABLED = 'true';
process.env.SESSION_SECRET = 'browser-entry-route-test-secret-2026';
process.env.ADMIN_USERNAME = 'layout_test_admin';

test('login and legacy dashboard URLs resolve to styled current pages', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('isolated-route-test-password', 10);
  const app = require('../app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  function request(method, url, { cookie, body } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? '' : JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1', port: server.address().port, path: url, method,
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) }
      }, (res) => {
        let text = '';
        res.setEncoding('utf8'); res.on('data', (chunk) => text += chunk);
        res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, headers: res.headers, body: text }));
      });
      req.on('error', reject); if (payload) req.write(payload); req.end();
    });
  }

  assert.equal((await request('GET', '/login')).location, '/login.html');
  assert.equal((await request('GET', '/dashboard.html')).location, '/login');
  assert.equal((await request('GET', '/results/upload')).location, '/login');
  assert.equal((await request('GET', '/results/extract')).location, '/login');
  assert.equal((await request('GET', '/result-upload.html')).location, '/login');
  assert.equal((await request('GET', '/result-extraction.html')).location, '/login');
  const login = await request('POST', '/api/auth/login', { body: { username: 'layout_test_admin', password: 'isolated-route-test-password' } });
  assert.equal(login.status, 200);
  const cookie = String(login.headers['set-cookie']?.[0] || '').split(';')[0];
  assert.ok(cookie);
  const legacy = await request('GET', '/dashboard.html', { cookie });
  assert.equal(legacy.status, 302);
  assert.equal(legacy.location, '/dashboard');
  const dashboard = await request('GET', '/dashboard', { cookie });
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.body, /class="app-shell"/);
  assert.match(dashboard.body, /href="\/css\/style\.css"/);
  assert.match(dashboard.body, /id="filterBatch"/);
  const uploadPage = await request('GET', '/results/upload', { cookie });
  assert.equal(uploadPage.status, 200);
  assert.match(uploadPage.body, /VTU Original Result Upload/);
  assert.match(uploadPage.body, /confirm and save all results/i);
  assert.equal((await request('GET', '/result-upload.html', { cookie })).status, 200);
  const extractionPage = await request('GET', '/results/extract', { cookie });
  assert.equal(extractionPage.status, 200);
  assert.match(extractionPage.body, /PDF Result Extraction/);
  assert.equal((await request('GET', '/result-extraction.html', { cookie })).status, 200);
});
