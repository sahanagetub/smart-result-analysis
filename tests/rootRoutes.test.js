const test = require('node:test');
const assert = require('node:assert/strict');
const pageRoutes = require('../routes/pageRoutes');
const apiRoutes = require('../routes');

function roots(router) {
  return router.stack.filter((layer) => layer.route?.path === '/').length;
}

test('page routes own exactly one root redirect; API router defines none', () => {
  assert.equal(roots(pageRoutes), 1);
  assert.equal(roots(apiRoutes), 0);
});

test('root redirect sends guests to login and authenticated users to dashboard', () => {
  const root = pageRoutes.stack.find((layer) => layer.route?.path === '/').route.stack[0].handle;
  for (const [session, expected] of [[{}, '/login'], [{ user: { username: 'staff' } }, '/dashboard']]) {
    const res = { redirect(path) { this.location = path; return this; } };
    root({ session }, res);
    assert.equal(res.location, expected);
  }
});
