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
    "longPollSourceChanges": true,  // Optional, default = false.
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
