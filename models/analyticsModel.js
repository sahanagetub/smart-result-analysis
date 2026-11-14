const { getPool, isDbDisabled } = require('../config/db');

/** Execute a parameterized SQL query and return rows. */
async function executeQuery(sql, params = []) {
  if (isDbDisabled()) return [];
  const pool = getPool();
  if (!pool) return [];
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  executeQuery
};

