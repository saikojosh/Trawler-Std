# Trawler (trawler-std)
Trawler (`npm install -g trawler-std`) is a simple utility that sits in front of your Node app and performs a number of tasks including:
* Capturing console output (stdout) and console errors (stderr) of your app.
* Streaming the output somewhere (e.g. to a file on disk).
* Daily log file rotation using the same naming convention as [Bunyan](https://www.npmjs.com/package/bunyan).
* Sending admin notifications on app crash (e.g. Slack or email (not implemented yet!)).
* Automatically restarting your app after a crash.
* Automatically restarting your app when source code changes.
* Supports watching for source code changes on network shares and Docker volumes.
* Trawler is production ready, and great for development too.

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
    "sourceChangeThreshold": 200,  // Optional, default = 500.
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
    }, {
      "type": "file",
      "excludeEnvironments": ["production"],  // Optional.
      "location": "/dev/logs",
      "logName": "crash"  // Optional.
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
It's very easy to configure Trawler, there's no need to use CLI arguments or setup special config files. All you need is your good old `package.json`. You'll need to add the properties to configure Trawler itself, as well as the streams and notifications you want to use.

### Configuring Trawler

| Property              | Default | Description |
|-----------------------|---------|-------------|
| restartOnCrash        | false   | Set `true` to automatically restart your app when it crashes. |
| restartOnSourceChange | false   | Set `true` to automatically restart your app when the source files change. |
| maxCrashRestarts      | 0       | The maximum number of times to restart your app when it crashes if `restartOnCrash` is `true`. 0 = unlimited restarts.
| pollSourceChanges     | false   | Set `true` to manually check for file changes rather than relying on OS events. Drastically increases CPU usage but required for network shares and Docker volumes. |
| sourceChangeThreshold | 500     | Time in milliseconds to wait for other file changes before reloading your app if `restartOnSourceChange` is `true`. Setting to a smaller number will result in (slightly) faster reloads but may lead to reloading multiple times if you change multiple files at once. |
| console.stdout        | false   | Set `true` to output your app's standard console output in the terminal. |
| console.stderr        | false   | Set `true` to output your app's error console output in the terminal. |
| streams[]             |         | Specify one or more streams (see below). |
| notifications[]       |         | Specify one or more notifications (see below). |

### Configuring Streams and Notifications
Trawler grabs the output of your app but it needs to know what to do with it. Streams are Trawler's way of knowing where to send the data once it has it and are usually used for logging to disk. Notifications are how Trawler notifies you of problems for example sending a Slack notification. You can have multiple streams/notifications of the same type.

| Property              | Default | Description |
|-----------------------|---------|-------------|
| type                  |         | The type of stream/notification e.g. `file` or `slack`. |
| environments[]        |         | To **limit** this stream/notification to run **only** in specific environments, specify an array of environment strings. By default streams/notifications will run in all environments. |
| excludeEnvironments[] |         | To **prevent** this stream/notification from running in specific environments, specify an array of environments strings. |

#### Streams

##### File:
Writes your app's output to a file on disk in a JSON-like format similar to [Bunyan](https://www.npmjs.com/package/bunyan). Supports daily log rotation using the same naming scheme as Bunyan.

| Property    | Default | Description |
|-------------|---------|-------------|
| location    |         | Specify the location to store your log file(s). Paths starting with `/` are absolute paths, all other paths are relative to your app's base directory. |
| logName     | "crash" | Specify a custom name for your log files. |
| rotateLogs  | false   | Set `true` to enable daily log rotation based on UTC times. |
| maxBackLogs | 6       | Specify a custom number of backlogs to keep in addition to the current day's log file. |

#### Notifications

##### Slack:
Sends a notification to a Slack channel when your app crashes.

| Property    | Default   | Description |
|----------==-|-----------|-------------|
| url         |           | Add your Slack webhook URL in here. |
| username    | "Trawler" | Specify a custom username to display in Slack.  |
| iconEmoji   | "\:anchor\:" :anchor: | Specify a custom Slack emoji to use next to the username in Slack. |
| attention[] |           | Specify an array of Slack usernames to notify. |


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
* It's currently not possible to ignore specific files when restarting due to source file changes.
* It's currently not possible for a stream to handle **only** the stdout or stderr of your app. Each stream will receive a combined stream of both.
* It's currently not possible to wait to restart your crashed app until source files have been changed (like Nodemon), instead Trawler will restart your app immediately when it crashes.
