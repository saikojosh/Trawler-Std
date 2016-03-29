# Trawler
Trawler (`npm install -g trawler-std`) is a simple utility that sits in front of your Node app and performs a number of tasks including:
* Capturing console output (stdout) and console errors (stderr).
* Streaming the output somewhere (e.g. to a file on disk).
* Daily log file rotation using the same naming convention as [Bunyan](https://www.npmjs.com/package/bunyan).
* Sending admin notifications on app crash (e.g. Slack or email (not implemented yet!)).
* Automatically restarting your app after a crash.
* Automatically restarting your app when source code changes.

## Setup
To use Trawler do the following:

1. Install Trawler globally with `npm install -g trawler-std`.
2. Setup your application's `package.json` as follows:
```javascript
{
  "name":    "{appName}",
  "version": "0.1.5",
  "main":    "{filename}",
  ...
  "trawler": {
    "restartOnCrash": true,  // Optional.
    "restartOnSourceChange": true,  // Optional.
    "maxCrashRestarts": 5,  // Optional, 0 = unlimited restarts, default = 0.
    "pollSourceChanges": true,  // Optional, default = false.
    "console": {
      "stdout": true,  // Optional, default = false.
      "stderr": true  // Optional, default = false.
    },
    "streams": [{
      "type": "file",
      "environments": ["staging", "production"],  // Optional.
      "location": "logs",
      "logName": "crash",  // Optional.
      "rotateLogs": true,  // Optional.
      "maxBackLogs": 6  // Optional.
    }],
    "notifications": [{
      "type": "slack",
      "environments": ["production"],  // Optional.
      "url": "{webhookURL}",
      "username": "Trawler",  // Optional.
      "iconEmoji": ":anchor:"  // Optional.
    }]
  }
}
```
3. From the command line run your app with `trawler`.

## Package.json Configuration
These are the properties you can specify in your app's `package.json` to configure Trawler:

**...TODO...**

## Command Line Arguments
You can use the following arguments when running Trawler:

* `-d` `--debug` - Make Trawler output more detail on the command line - great for debugging during development and setting up inside Docker containers.
* `-e` `--env` - Override the environment that Trawler is running in, i.e. specify 'development', 'staging', 'production', or any other environment string your app uses. Trawler will pass the argument `--env myEnvString` to your app, which can then choose to respect this or not.
* `--stdout` - Display your application's stdout in the console.
* `--stderr` - Display your application's stderr in the console.
* `--stdall` - Display both the stdout and stderr in the console.

## Comparison of Trawler, Forever and Nodemon

### Forever
**Pros:**
* Tried and tested way to restart apps on fatal crash: [example](https://github.com/foreverjs/forever-monitor/blob/master/examples/error-on-timer.js).
* Log app's stdout/stderr to separate log files.
* Watches for file changes and restarts the app.

**Cons:**
* An external app is required to rotate logs.
* Does not support sending notifications on app crash.
* Does not support multiple streams e.g. file + something else.
* Does not support JSON logging.
* Does not support combining stdout and stderr into one file.

### Nodemon
**Pros:**
* Tried and tested way to restart apps on source file change.
* Can ignore specific files when watching for changes.
* Supports polling for file changes.

**Cons:**
* Designed for development so doesn't restart on app crash.
* Does not support sending notifications on app crash.
* Does not support streaming logs to file via the command line.
* Does not support multiple streams e.g. file + something else.

### Trawler
**Pros:**
* Restart app on crash.
* Restart app on source change.
* Supports polling for file changes.
* Log app stdout and stderr to the same file.
* JSON logging in the same format as Bunyan.
* Rotates logs in the same way as Bunyan, without an external app.
* Sends notifications on app crash.
* Supports multiple stream destinations (only 'file' is implemented so far).
* Supports multiple notification consumers (only 'slack' is implemented so far).
* Designed for use in both development and production.
* Can switch off certain streams/notifications depending on the environment.

**Cons:**
* Can't ignore specific files when watching for source file changes.
* Does not support separate files for stdout and stderr.

## In Detail

### Log Output
If you configure the `file` stream then the stdout and stderr of your application will be combined and written to the same log file. It's recommended that your application uses a logging framework such as [Bunyan ](https://www.npmjs.com/package/bunyan) to manage log output instead of relying on the `console.*` methods. This will prevent your Trawler log file from becoming bloated.

However, if you want to see your application's stdout and stderr in the console you can set the `console.stdout` and `console.stderr` config properties to true in `package.json`, or use the `--stdout`, `--stderr` or `--stdall` CLI arguments.

### Known Issues
* Changing Trawler's configuration in `package.json` on the fly will not work, despite Trawler reloading your application if `restartOnSourceChange` is set.
