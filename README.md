# Trawler
Trawler (`npm install trawler-std -g`) is a simple utility that sits in front of your Node app and performs a number of tasks including:
* Capturing console output (stdout) and console errors (stderr).
* Streaming the output somewhere (e.g. a file on disk).
* Daily log file rotation.
* Sending admin notifications on app crash (e.g. Slack or email).
* Automatically restarting your app.

## Setup
To use Trawler do the following:

1. Install Trawler globally with $ `npm install trawler-std -g`.
2. Setup your application's _package.json_ as follows:
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
3. Run your app like $ `trawler` in your application directory.

## Command Line arguments
You can use the following arguments when running Trawler:

* `-d` `--debug` - Make Trawler output more detail on the command line - great for debugging and setting up.
* `-e` `--env` - Override the environment that Trawler is running in, i.e. specify 'development', 'staging', 'production', or any other environment string your app uses. Trawler will pass the argument _--env 'my-env-string'_ to your app, which can then choose to respect this or not.
