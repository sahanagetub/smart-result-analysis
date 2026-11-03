const app = require('./app');
const config = require('./config/config');

const server = app.listen(config.port, () => {
  console.log(`${config.appName} running on http://localhost:${config.port}`);
});

module.exports = server;
