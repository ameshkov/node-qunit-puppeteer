const path = require('path');
const {
  runQunitPuppeteer, printOutput, printResultSummary, printFailedTests,
} = require('../index');

const qunitArgs = {
  targetUrl: `file://${path.join(__dirname, 'test-runner.html')}`,
  timeout: 10000,
  redirectConsole: true,
};

/**
 * Expected result:
Test run result: fail
Total tests: 4
  Assertions: 6
  Passed assertions: 5
  Failed assertions: 1
 */

const Console = console;
runQunitPuppeteer(qunitArgs)
  .then((result) => {
    // Print the test result to the output
    Console.log();
    Console.log('==========    printOutput     =========='.blue.bold);
    printOutput(result, console);

    Console.log();
    Console.log('========== printResultSummary =========='.blue.bold);
    printResultSummary(result, console);
    if (result.stats.failed > 0) {
      Console.log();
      Console.log('==========  printFailedTests  =========='.blue.bold);
      printFailedTests(result, console);
    }
  })
  .catch((ex) => {
    Console.error(ex);
  });
