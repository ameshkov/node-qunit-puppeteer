const path = require('path');
const { runQunitPuppeteer, printOutput } = require('../index');

const qunitArgs = {
  targetUrl: `file://${path.join(__dirname, 'test-runner.html')}`,
  timeout: 10000,
  redirectConsole: true,
};

runQunitPuppeteer(qunitArgs)
  .then((result) => {
    // Print the test result to the output
    printOutput(result, console);
    if (result.stats.failed > 0) {
      // Handle the failed test run
    }
  })
  .catch((ex) => {
    console.error(ex);
  });
