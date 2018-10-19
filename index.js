const puppeteer = require('puppeteer');

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
      deferred.resolve(result);
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

module.exports.runQunitPuppeteer = runQunitPuppeteer;
