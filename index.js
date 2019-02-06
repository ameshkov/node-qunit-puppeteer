const puppeteer = require('puppeteer');
const colors = require('colors');

const DEFAULT_TIMEOUT = 30000;
const CALLBACKS_PREFIX = 'qunit_puppeteer_runner';
const MODULE_START_CB = `${CALLBACKS_PREFIX}_moduleStart`;
const MODULE_DONE_CB = `${CALLBACKS_PREFIX}_moduleDone`;
const TEST_START_CB = `${CALLBACKS_PREFIX}_testStart`;
const TEST_DONE_CB = `${CALLBACKS_PREFIX}_testDone`;
const LOG_CB = `${CALLBACKS_PREFIX}_log`;
const BEGIN_CB = `${CALLBACKS_PREFIX}_begin`;
const DONE_CB = `${CALLBACKS_PREFIX}_done`;

/**
  @typedef QunitPuppeteerArgs
  @type {object}
  @property {string} targetUrl URL or a path to the HTML file with QUnit tests
  @property {number} timeout - maximum timeout (optional, default = 30 seconds)
  @property {boolean} redirectConsole - if true -- redirects the page console to the output
 */

/**
  @typedef QunitTestResult
  @type {object}
  @property {Array.<QunitModule>} module a list of modules
  @property {object} stats - total tests run stats
 */

/**
 * Helper function that allows resolve promise externally
 */
function defer() {
  const deferred = {
    promise: null,
    resolve: null,
    reject: null,
  };

  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  return deferred;
}

/**
 * Simple object cloning
 * @param {*} object Object to clone
 */
function deepClone(object) {
  return JSON.parse(JSON.stringify(object));
}

/**
 * Exposes callback functions
 * @param {Page} page Puppeteer page
 * @returns {object} a deferred object (see defer) that will be resolved or rejected
 * when all tests are done. This object will receive a {QunitTestResult} parameter
 */
async function exposeCallbacks(page) {
  const result = {
    modules: {},
  };

  const deferred = defer();

  await page.exposeFunction(BEGIN_CB, (context) => {
    try {
      result.totalTests = context.totalTests;
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(DONE_CB, (context) => {
    try {
      result.stats = deepClone(context);
      deferred.resolve(result);
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(TEST_DONE_CB, (context) => {
    try {
      const test = deepClone(context);
      const module = result.modules[test.module];
      const currentTest = module.tests.find(t => t.name === test.name);
      Object.assign(currentTest, test);
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(MODULE_START_CB, (context) => {
    try {
      const module = deepClone(context);
      result.modules[module.name] = module;
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(MODULE_DONE_CB, (context) => {
    try {
      const module = deepClone(context);
      const currentModule = result.modules[module.name];
      currentModule.failed = module.failed;
      currentModule.passed = module.passed;
      currentModule.runtime = module.runtime;
      currentModule.total = module.total;
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(TEST_START_CB, (context) => {
    try {
      const test = deepClone(context);
      const module = result.modules[test.module];
      const currentTest = module.tests.find(t => t.name === test.name);
      Object.assign(currentTest, test);
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(LOG_CB, (context) => {
    try {
      const record = deepClone(context);
      const module = result.modules[record.module];
      const currentTest = module.tests.find(t => t.name === record.name);

      currentTest.log = currentTest.log || [];
      currentTest.log.push(record);
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  return deferred;
}

/**
 * Opens the specified HTML page in a Chromium puppeteer and captures results of a test run.
 * @param {QunitPuppeteerArgs} qunitPuppeteerArgs Configuration for the test runner
 */
async function runQunitPuppeteer(qunitPuppeteerArgs) {
  const timeout = qunitPuppeteerArgs.timeout || DEFAULT_TIMEOUT;

  const args = { args: ['--allow-file-access-from-files'] };
  const browser = await puppeteer.launch(args);

  try {
    // Opens the target page
    const page = await browser.newPage();

    // Redirect the page console if needed
    if (qunitPuppeteerArgs.redirectConsole) {
      const Console = console;
      page.on('console', (consoleArgs) => { Console.log('[%s] %s', consoleArgs.type(), consoleArgs.text()); });
    }

    // Prepare the callbacks that will be called by the page
    const deferred = await exposeCallbacks(page);

    // Run the timeout timer just in case
    const timeoutId = setTimeout(() => { deferred.reject(new Error(`Test run could not finish in ${timeout}ms`)); }, timeout);

    // Configuration for the in-page script (will be passed via evaluate to the page script)
    const evaluateArgs = {
      testTimeout: timeout,
      callbacks: {
        begin: BEGIN_CB,
        done: DONE_CB,
        moduleStart: MODULE_START_CB,
        moduleDone: MODULE_DONE_CB,
        testStart: TEST_START_CB,
        testDone: TEST_DONE_CB,
        log: LOG_CB,
      },
    };

    await page.evaluateOnNewDocument((qunitConfiguration) => {
      /* global window */

      // IMPORTANT: This script is executed in the context of the page
      // YOU CANNOT ACCESS ANY VARIABLE OUT OF THIS BLOCK SCOPE
      function extendQUnit(QUnit) {
        try {
          // eslint-disable-next-line
          QUnit.config.testTimeout = qunitConfiguration.testTimeout;

          // Pass our callback methods to QUnit
          const callbacks = Object.keys(qunitConfiguration.callbacks);
          for (let i = 0; i < callbacks.length; i += 1) {
            const qunitName = callbacks[i];
            const callbackName = qunitConfiguration.callbacks[qunitName];
            QUnit[qunitName]((context) => { window[callbackName](context); });
          }
        } catch (ex) {
          const Console = console;
          Console.error(`Error while executing the in-page script: ${ex}`);
        }
      }

      let qUnit;
      Object.defineProperty(window, 'QUnit', {
        get: () => qUnit,
        set: (value) => {
          qUnit = value;
          extendQUnit(qUnit);
        },
      });
    }, evaluateArgs);

    // Open the target page
    await page.goto(qunitPuppeteerArgs.targetUrl);

    // Wait for the test result
    const qunitTestResult = await deferred.promise;

    // All good, clear the timeout
    clearTimeout(timeoutId);
    return qunitTestResult;
  } catch (ex) {
    throw ex;
  } finally {
    if (browser) {
      browser.close();
    }
  }
}

/**
 * Takes the output of runQunitPuppeteer and prints it to console with identation and colors
 * @param {*} result result of the runQunitPuppeteer
 */
function printOutput(result, console) {
  const moduleNames = Object.keys(result.modules);
  const moduleCount = moduleNames.length;
  for (let i = 0; i < moduleCount; i += 1) {
    const module = result.modules[moduleNames[i]];
    console.group(`Module: ${module.name}`);

    const testCount = module.tests.length;
    for (let j = 0; j < testCount; j += 1) {
      const test = module.tests[j];
      console.group(`${test.name}`);
      if (test.failed > 0) {
        console.log('Status: failed'.red.bold);
      } else {
        console.log('Status: success'.green.bold);
      }
      console.log(`Passed assertions: ${test.passed} of ${test.total}`);
      console.log(`Elapsed: ${test.runtime}ms`);

      if (test.failed > 0) {
        if (test.log) {
          printTestLog(test.log, console);
        }
      }

      console.groupEnd();
    }

    console.groupEnd();
  }

  printResultSummary(result, console);
}


/**
 * Takes the output of runQunitPuppeteer and prints a summary to console with identation and colors
 * @param {*} result result of the runQunitPuppeteer
 */
function printResultSummary(result, console) {
  console.log();

  if (result.stats.failed === 0) {
    console.log('Test run result: success'.green.bold);
  } else {
    console.log('Test run result: fail'.red.bold);
  }

  console.group(`Total tests: ${result.totalTests}`);
  console.log(`Assertions: ${result.stats.total}`);
  console.log(`Passed assertions: ${result.stats.passed.toString().green}`);
  console.log(`Failed assertions: ${result.stats.failed > 0 ? result.stats.failed.toString().red : result.stats.failed}`);
  console.log(`Elapsed: ${result.stats.runtime}ms`);
  console.groupEnd();
}


/**
 * Takes the output of runQunitPuppeteer and prints failed test(s) information to console with identation and colors
 * @param {*} result result of the runQunitPuppeteer
 */
function printFailedTests(result, console) {
  // there is nothing to see here . . . move along, move along
  if (result.stats.failed === 0) {
    return;
  }

  const moduleNames = Object.keys(result.modules);
  const moduleCount = moduleNames.length;
  for (let i = 0; i < moduleCount; i += 1) {
    const module = result.modules[moduleNames[i]];

    // there is nothing to see here . . . move along, move along
    if (module.failed === 0) {
      continue;
    }

    //console.log();
    console.group(`Module: ${module.name}`);

    const testCount = module.tests.length;
    for (let j = 0; j < testCount; j += 1) {
      const test = module.tests[j];

      // there is nothing to see here . . . move along, move along
      if (test.failed === 0) {
        continue;
      }

      console.group(`Test: ${test.name}`);
      console.log('Status: failed'.red.bold);
      console.log(`Failed assertions: ${test.failed} of ${test.total}`);
      console.log(`Elapsed: ${test.runtime}ms`);

      if (test.log) {
        printTestLog(test.log, console);
      }

      console.groupEnd();
    }

    console.groupEnd();
  }
}

/**
 * Takes the test's log output and prints the information to console with identation and colors
 * @param {*} log log of the test
 */
function printTestLog(log, console) {
  console.group('Log');

  const logCount = log.length;
  for (let n = 0; n < logCount; n += 1) {
    const logRecord = log[n];
    const message = `Result: ${logRecord.result}, Expected: ${logRecord.expected}, Actual: ${logRecord.actual}, Message: ${logRecord.message}`;
    console.log(logRecord.result ? message.green : message.red);
  }

  console.groupEnd();
}

module.exports.runQunitPuppeteer = runQunitPuppeteer;
module.exports.printOutput = printOutput;
module.exports.printResultSummary = printResultSummary;
module.exports.printFailedTests = printFailedTests;
