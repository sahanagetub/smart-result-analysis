'use strict';

// Explicit opt-in runner: demo data is never inserted as part of app startup.
const { getPool, isDbDisabled } = require('../../config/db');
const { seedDemoData } = require('../../services/seedService');

async function main() {
  const isNonProduction = ['development', 'test'].includes(process.env.NODE_ENV);
  const safeDatabase = /(^|[_-])(dev|development|test|testing|sandbox)([_-]|$)/i.test(String(process.env.DB_NAME || ''));
  if (!isNonProduction || !safeDatabase) {
    throw new Error('Demo seeding requires NODE_ENV=development or test and a development/test/sandbox DB_NAME.');
  }
  if (isDbDisabled()) throw new Error('Database integration is disabled.');
  const result = await seedDemoData();
  console.log(`Explicit demo seed completed: ${result.resultsCount || 0} result rows inserted.`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Demo seed failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      const pool = getPool();
      if (pool) await pool.end();
    });
}

module.exports = { main };
