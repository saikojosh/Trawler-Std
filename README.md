# Trawler-Std

Trawler-Std (`npm install -g trawler-std`) is an application **supervisor** that sits in front of your Node app and performs a number of tasks including:
* Capturing the console output (stdout) and console errors (stderr) of your app.
* Streaming the output somewhere (e.g. to a file on disk).
* Daily log file rotation using the same naming convention as [Bunyan](https://www.npmjs.com/package/bunyan).
* Optionally pass your app's stdout and stderr to the terminal.
* Sending admin notifications on app crash (e.g. Slack).
* Automatically restarting your app after a crash (or optionally waiting for source code changes).
* Automatically restarting your app when source code changes.
* Supports watching for source code changes on network shares and Docker volumes.
* Supports ignoring or watching specific source file paths (as strings or regular expressions).

Trawler is production ready, and great for development too. It's also been built with Docker containers as one of the primary use cases.

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
    "crash": {
      "autoRestart": true,  // Optional, default = false.
      "maxRestarts": 3,  // Optional, default = 0, zero = unlimited restarts.
      "waitSourceChange": true  // Optional, default = false.
    },
    "sourceChange": {
      "autoRestart": true,  // Optional, default = false.
      "environments": ["development"],  // Optional.
      "usePolling": true,  // Optional, default = false.
      "ignored": ["regexp:Dockerfile", "regexp:i:.*\\.md$"],  // Optional.
      "watched": ["my_directory"]  // Optional.
    },
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

| Property                            | Default | Description |
|-------------------------------------|---------|-------------|
| crash.autoRestart                   | false   | Set `true` to automatically restart your app when it crashes. |
| crash.maxRestarts                   | 0       | The maximum number of times to restart your app when it crashes if `restartOnCrash` is `true`. 0 = unlimited restarts. |
| crash.waitSourceChange              | false   | Set `true` to prevent a crashed app from restarting until the source code has changed. Forces `sourceChange.autoRestart` to be `true`. |
| sourceChange.autoRestart            | false   | Set `true` to automatically restart your app when the source files change. |
| sourceChange.environments[]         |         | To **limit** source change watching to run **only** in specific environments, specify an array of environment strings. By default it will run in all environments. |
| sourceChange.excludeEnvironments[]  |         | To **prevent** source change watching from running in specific environments, specify an array of environments strings. |
| sourceChange.threshold              | 500     | Time in milliseconds to wait for other file changes before reloading your app if `restartOnSourceChange` is `true`. Setting to a smaller number will result in (slightly) faster reloads but may lead to reloading multiple times if you change multiple files at once. |
| sourceChange.usePolling             | false   | Set `true` to manually check for file changes rather than relying on OS events. Required for network shares and Docker volumes. |
| sourceChange.pollingIntervalDefault | 100     | When `usePolling` is `true` you can increase this value to reduce CPU usage when polling files (not including binary files). |
| sourceChange.pollingIntervalBinary  | 300     | When `usePolling` is `true` you can increase this value to reduce CPU usage when polling binary files. |
| sourceChange.ignored[]              |         | Specify an array of strings or regular expressions to ignore when watching for source file changes. |
| sourceChange.watched[]              |         | Specify an array of strings or regular expressions to watch when watching for source file changes. This overrides the default ignored paths plus any you specify in `sourceChange.ignored`. |
| notifyOnFirstBoot     | false   | Set `true` to send a notification the first time the app boots up. Useful for knowing when an app has successfully deployed and started. |
| cliColours            | true    | Set 'false' to prevent Trawler from formatting its console output with colours. |
| console.stdout        | false   | Set `true` to output your app's standard console output in the terminal. |
| console.stderr        | false   | Set `true` to output your app's error console output in the terminal. |
| streams[]             |         | Specify one or more streams (see below). |
| notifications[]       |         | Specify one or more notifications (see below). |

### Configuring Streams and Notifications
Trawler grabs the output of your app but it needs to know what to do with it. Streams are Trawler's way of knowing where to send the data once it has it and are usually used for logging to disk. Notifications are how Trawler notifies you of problems for example sending a Slack notification. You can have multiple streams/notifications of the same type.

| Property              | Default | Description |
|-----------------------|---------|-------------|
| type                  |         | The type of stream/notification e.g. `file` or `slack`. |
| id                    |         | Optional - specify an ID to make it easier to identify the stream/notification in the debug logs. |
| disabled              | false   | Set `true` to turn off this stream/notification. |
| environments[]        |         | To **limit** this stream/notification to run **only** in specific environments, specify an array of environment strings. By default streams/notifications will run in all environments. |
| excludeEnvironments[] |         | To **prevent** this stream/notification from running in specific environments, specify an array of environments strings. |

#### Streams

##### File:
Writes your app's output to a file on disk in a JSON-like format similar to [Bunyan](https://www.npmjs.com/package/bunyan). Supports daily log rotation using the same naming scheme as Bunyan.

| Property     | Default | Description |
|--------------|---------|-------------|
| location     |         | Specify the location to store your log file(s). Paths starting with `/` are absolute paths, all other paths are relative to your app's base directory. |
| logName      | "crash" | Specify a custom name for your log files. |
| rotateLogs   | false   | Set `true` to enable daily log rotation based on UTC times. |
| maxBackLogs  | 6       | Specify a custom number of backlogs to keep in addition to the current day's log file. |
| crashOnError | true    | Set `false` to prevent Trawler from crashing if the file stream encounters an error i.e. unable to create a log directory. Errors writing to the log file will not crash Trawler, however, you will receive one notification per application start if this error occurs. |

#### Notifications

##### Slack:
Sends a notification to a Slack channel when your app crashes.

| Property    | Default   | Description |
|-------------|-----------|-------------|
| url         |           | Add your Slack webhook URL in here. |
| username    | "Trawler" | Specify a custom username to display in Slack.  |
| iconEmoji   | "\:anchor\:" :anchor: | Specify a custom Slack emoji to use next to the username in Slack. |
| attention[] |           | Specify an array of Slack usernames to notify. The '@' is optional. |

##### Email:
Sends a notification to one or more email addresses when your app crashes.

| Property                | Default   | Description |
|-------------------------|-----------|-------------|
| provider*                |           | The ID of the transactional email provider to use (see below). |
| apiKey                  |           | The API key to use with your email provider.  |
| notificationAddresses[] |           | An array of email addresses to send notifications to. |
| fromEmail               |           | The email address the notifications should be sent from. |

\*Currently Trawler only supports [Postmark](https://postmarkapp.com/).


## Command Line Arguments
You can use the following arguments when running Trawler:

* `-i` `--info` - Outputs some information about Trawler in the command line and then quits.
* `-d` `--debug` - Make Trawler output more detail on the command line - great for debugging during development and setting up inside Docker containers.
* `-e` `--env` - Override the environment that Trawler is running in, i.e. specify 'development', 'staging', 'production', or any other environment string your app uses. Trawler will pass the argument `--env myEnvString` to your app, which can then choose to respect this or not.
* `-p` `--plain` - Prevent Trawler from formatting its console output with colours.
* `--stdout` - Display your application's stdout in the console.
* `--stderr` - Display your application's stderr in the console.
* `--stdall` - Display both the stdout and stderr in the console.
* `--debug-watch-events` - Output extra information on the filesystem events when watching for source file changes.
* `--debug-watch-events-full` - Outputs a lot of extra information on the filesystem events when watching for source file changes. Only one of the debug watch events flags are required.

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

### Watching For Source Changes
When watching for source file changes Trawler will watch all files and directories by default, except for the following:

* All file and directory names that begin with a dot e.g. `.gitignore`, `.sass-cache/` etc.
* The `node_modules` directory.
* The `bower_components` directory.

You can see which file changes are being detected by using the `--watch-file-events` CLI argument.

### Ignored/Watched Source Files - String/RegExp Format
When specifying `sourceChange.ignored` or `sourceChange.watched` you can pass an array of strings if you know the exact path/file names, or you can pass a regular expression string like this: `"regexp:{flags}:{regexpString}"`. The flags are the same flags that `new RegExp()` expects and are optional.

* Backslashes must be escaped.
* Paths are like `package.json`, `config` and `config/routes.js`, i.e. there are no leading or trailing slashes.
* You can ignore all paths with the regular expression `regexp:i:.+`.
* Any paths you specify in `watched` will override the ignore paths, including the default ignored paths.

```javascript
"ignored": ["regexp:gi:[a-z]+", "regexp:i:.*\\.md$", "regexp:ops\\.log(?:.\\d+)?"],
"watched": ["my_directory"]
```

### Notification Status Codes
When Trawler notifies you it sends a status code to let you know what's happening:

| Status Code       | Description |
|-------------------|-------------|
| app-first-boot    | Your application has booted successfully for the first time. |
| app-crash         | Your application has crashed and been restarted. |
| app-no-restarts   | Your application has crashed but has not been restarted because `restartOnCrash` is `false`. |
| app-restart-limit | Your application has crashed but has not been restarted because it has reached the restarted limit set in `maxCrashRestarts`. |
| trawler-crash     | Trawler itself has crashed. You will need to restart Trawler to restart your app (and probably submit an issue on [GitHub](https://github.com/saikojosh/Trawler/issues)!) |
| trawler-error     | Same as `trawler-crash` except Trawler has recovered from the problem without crashing. |

### Known Issues
* Changing Trawler's configuration in `package.json` on the fly will not work, despite Trawler reloading your application if `sourceChange.autoRestart` is set.
* It's currently not possible for a stream to handle **only** the stdout or stderr of your app. Each stream will receive a combined stream of both.
* If an error occurs in the file stream and `crashOnError` is `true`, you'll only receive the error stack in the notification and not the explanation message.
