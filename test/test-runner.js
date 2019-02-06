const path = require('path');
const { runQunitPuppeteer, printOutput, printResultSummary, printFailedTests } = require('../index');

const qunitArgs = {
  targetUrl: `file://${path.join(__dirname, 'test-runner.html')}`,
  timeout: 10000,
  redirectConsole: true
};

runQunitPuppeteer(qunitArgs)
  .then((result) => {
    // Print the test result to the output
    console.log();
    console.log('==========    printOutput     =========='.blue.bold);
    printOutput(result, console);

    console.log();
    console.log('========== printResultSummary =========='.blue.bold);
    printResultSummary(result, console);
    if (result.stats.failed > 0) {
      console.log();
      console.log('==========  printFailedTests  =========='.blue.bold);
      printFailedTests(result, console);
    }
  })
  .catch((ex) => {
    console.error(ex);
  });
