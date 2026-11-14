const analyticsModel = require('../models/analyticsModel');

/** Run the database query and return rows. */
async function executeQuery(sql, params = []) {
  return analyticsModel.executeQuery(sql, params);
}

module.exports = {
  executeQuery
};

