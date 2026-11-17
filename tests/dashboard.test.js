const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.DB_DISABLED = 'true';
const dashboardRoutes = require('../routes/dashboardRoutes');

function startServer(authenticated = true) {
  const app = express();
  app.use((req, res, next) => {
    if (authenticated) req.session = { user: { username: 'dashboard-test', role: 'Admin' } };
    next();
  });
  app.use('/api/dashboard', dashboardRoutes);
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve({
      server,
      baseUrl: `http://127.0.0.1:${server.address().port}`
    }));
  });
}

test('dashboard endpoints return valid empty data when database is disabled', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());
  for (const endpoint of [
    '/api/dashboard/filter-options',
    '/api/dashboard/data',
    '/api/dashboard/summary',
    '/api/dashboard/top-performers',
    '/api/dashboard/recent-exams',
    '/api/dashboard/summary?academicYear=2025&semester=1&sessionId=1&examType=Quiz&subjectCode=CS101'
  ]) {
    const response = await fetch(baseUrl + endpoint);
    assert.equal(response.status, 200, endpoint);
    const payload = await response.json();
    assert.equal(payload.success, true, endpoint);
    assert.ok(payload.data, endpoint);
  }
});

test('dashboard rejects malformed filters and unauthenticated requests', async t => {
  const { server: authServer, baseUrl: authUrl } = await startServer();
  t.after(() => authServer.close());
  const invalid = await fetch(authUrl + '/api/dashboard/summary?semester=bad');
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).success, false);
  const invalidBatch = await fetch(authUrl + '/api/dashboard/data?batchId=1%3BDROP');
  assert.equal(invalidBatch.status, 400);

  const { server: publicServer, baseUrl: publicUrl } = await startServer(false);
  t.after(() => publicServer.close());
  const unauthorized = await fetch(publicUrl + '/api/dashboard/summary');
  assert.equal(unauthorized.status, 401);
});

test('dashboard data endpoint returns a consistent response and reports database failures', async t => {
  const dashboardService = require('../services/dashboardService');
  const original = dashboardService.getDashboardData;
  const { server, baseUrl } = await startServer();
  t.after(() => {
    dashboardService.getDashboardData = original;
    server.close();
  });
  const empty = await fetch(baseUrl + '/api/dashboard/data?batchId=1&semesterId=2&sessionId=3&subjectCode=MCA101');
  assert.equal(empty.status, 200);
  const emptyBody = await empty.json();
  assert.equal(emptyBody.data.summary.totalResults, 0);
  assert.deepEqual(emptyBody.data.charts.subjectPerformance, []);

  dashboardService.getDashboardData = async () => { throw new Error('simulated database failure'); };
  const failed = await fetch(baseUrl + '/api/dashboard/data');
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).success, false);
});
