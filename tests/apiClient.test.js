'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createApiClient(fetchMock) {
  const window = {};
  const source = fs.readFileSync(require.resolve('../public/js/api.js'), 'utf8');
  vm.runInNewContext(source, { window, fetch: fetchMock, Headers });
  return window.apiFetch;
}

test('safe API requests do not fetch or attach a CSRF token', async () => {
  const calls = [];
  const apiFetch = createApiClient(async (url, options) => {
    calls.push({ url, options });
    return { ok: true };
  });

  await apiFetch('/api/batches');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/batches');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.headers.has('X-CSRF-Token'), false);
});

test('state-changing API requests obtain and send the session CSRF token', async () => {
  const calls = [];
  const apiFetch = createApiClient(async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/auth/csrf') return { ok: true, json: async () => ({ csrfToken: 'session-token' }) };
    return { ok: true };
  });

  await apiFetch('/api/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_name: 'MCA 2026' })
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/auth/csrf');
  assert.equal(calls[1].url, '/api/batches');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers.get('X-CSRF-Token'), 'session-token');
  assert.equal(calls[1].options.credentials, 'include');
});
