# QUnit Puppeteer Runner Plugin

> A simple node module for running qunit tests with [headless Chromium](https://github.com/GoogleChrome/puppeteer).

There is a common issue with PhantomJS failing with ES6 code, and the logical solution is to use Chrome Puppeteer instead.

## Installation

* npm: `npm install node-qunit-puppeteer --save-dev`
* yarn: `yarn add node-qunit-puppeteer --dev`

## Usage

```javascript
const path = require('path');
const { runQunitPuppeteer, printOutput } = require('node-qunit-puppeteer');

const qunitArgs = {
  // Path to qunit tests suite
  targetUrl: `file://${path.join(__dirname, 'tests.html')}`,
  // (optional, 30000 by default) global timeout for the tests suite
  timeout: 10000,
  // (optional, false by default) should the browser console be redirected or not
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
```

Here's what is printed to the output:

<img width="499" style="border: 1px solid #efefef" src="https://user-images.githubusercontent.com/5947035/47224776-0888c800-d3c5-11e8-9364-6d6f1d4b3bd1.png">


Here's how the `result` object looks like:
```json
{
  "modules": {
    "module 1": {
      "name": "module 1",
      "tests": [
        {
          "name": "module 1 simple test 1",
          "testId": "49b931ed",
          "skip": false,
          "module": "module 1",
          "previousFailure": false,
          "log": [
            {
              "module": "module 1",
              "name": "module 1 simple test 1",
              "result": true,
              "message": "Passed 1!",
              "actual": true,
              "testId": "49b931ed",
              "negative": false,
              "runtime": 1,
              "todo": false,
              "expected": true
            },
            {
              "module": "module 1",
              "name": "module 1 simple test 1",
              "result": true,
              "message": "Passed 2!",
              "actual": true,
              "testId": "49b931ed",
              "negative": false,
              "runtime": 2,
              "todo": false,
              "expected": true
            }
          ],
          "skipped": false,
          "todo": false,
          "failed": 0,
          "passed": 2,
          "total": 2,
          "runtime": 3,
          "assertions": [
            {
              "result": true,
              "message": "Passed 1!"
            },
            {
              "result": true,
              "message": "Passed 2!"
            }
          ],
          "source": "    at file:///Users/..../test-runner.html:17:11"
        }
      ],
      "failed": 0,
      "passed": 2,
      "runtime": 3,
      "total": 2
    },
    "module 2": {
      "name": "module 2",
      "tests": [
        {
          "name": "module 2 simple test 2",
          "testId": "9f962b0e",
          "skip": false,
          "module": "module 2",
          "previousFailure": false,
          "log": [
            {
              "module": "module 2",
              "name": "module 2 simple test 2",
              "result": true,
              "message": "Passed 1!",
              "actual": true,
              "testId": "9f962b0e",
              "negative": false,
              "runtime": 0,
              "todo": false,
              "expected": true
            }
          ],
          "skipped": false,
          "todo": false,
          "failed": 0,
          "passed": 1,
          "total": 1,
          "runtime": 0,
          "assertions": [
            {
              "result": true,
              "message": "Passed 1!"
            }
          ],
          "source": "    at file:///Users/..../test-runner.html:23:11"
        },
        {
          "name": "module 2 failed test 1",
          "testId": "aae8e622",
          "skip": false,
          "module": "module 2",
          "previousFailure": false,
          "log": [
            {
              "module": "module 2",
              "name": "module 2 failed test 1",
              "result": false,
              "message": "Passed 1!",
              "actual": false,
              "testId": "aae8e622",
              "negative": false,
              "runtime": 0,
              "todo": false,
              "expected": true,
              "source": "    at Object.<anonymous> (file:///Users/..../test-runner.html:28:14)"
            }
          ],
          "skipped": false,
          "todo": false,
          "failed": 1,
          "passed": 0,
          "total": 1,
          "runtime": 1,
          "assertions": [
            {
              "result": false,
              "message": "Passed 1!"
            }
          ],
          "source": "    at file:///Users/..../test-runner.html:27:11"
        }
      ],
      "failed": 1,
      "passed": 1,
      "runtime": 2,
      "total": 2
    }
  },
  "totalTests": 3,
  "stats": {
    "passed": 3,
    "failed": 1,
    "total": 4,
    "runtime": 35
  }
}
```
