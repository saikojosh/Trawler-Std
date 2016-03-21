# Trawler
Trawler `trawler-std` is a simple utility that sits in front of your Node app and performs a number of tasks including:
* Capturing console output and errors.
* Streaming the output somewhere (e.g. a file on disk).
* Daily log rotation.
* Sending admin notifications on app crash (e.g. Slack or email).
* Automatically restarting your app

# Setup
To use Trawler do the following:

1. Install Trawler globally with $ `npm install trawler -g` or add Trawler as a peer dependency in your _package.json_.
2. Setup your application's _package.json_ as follows:
```javascript
{
  "name":    "{appName}",
  "version": "0.1.5",
  "main":    "{filename}",
  ...
  "peerDependencies": {
    "trawler-std": "..."  // Not required if installed globally.
  },
  ...
  "trawler": {
    "restartOnCrash": true,  // Optional.
    "maxRestarts": 5,  // Optional, 0 = unlimited restarts.
    "streams": [{
      "type": "file",
      "location": "logs",
      "logName": "crash",  // Optional.
      "rotateLogs": true,  // Optional.
      "maxBackLogs": 6  // Optional.
    }],
    "notifications": [{
      "type": "slack",
      "url": "{webhookURL}",
      "username": "Trawler",  // Optional.
      "iconEmoji": ":anchor:"  // Optional.
    }]
  }
}
```
3. Run your app like $ `trawler` in your application directory.
