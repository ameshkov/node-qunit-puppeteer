const path = require('path');
const { runQunitPuppeteer } = require('../index');

const qunitArgs = {
  targetUrl: `file:${path.join(__dirname, 'test-runner.html')}`,
  timeout: 10000,
  redirectConsole: true,
};

runQunitPuppeteer(qunitArgs)
  .then((result) => { console.log(JSON.stringify(result, 0, 2)); })
  .catch((ex) => { console.error(ex); });
