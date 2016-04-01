'use strict';

/*
 * TRAWLER (class).
 */

const spawn = require('child_process').spawn;
const os = require('os');
const stream = require('stream');
const async = require('async');
const chokidar = require('chokidar');
const extender = require('object-extender');
const moment = require('moment');
const packageJSON = require('./package.json');
const Logger = require('./modules/Logger');

module.exports = class Trawler {

  /*
   * Constructor.
   */
  constructor (inputConfig) {

    // Default config.
    this.config = extender.defaults({
      app: {
        name: 'unknown',
        version: 'unknown',
        mainFile: null,
        env: 'development',
      },
      trawler: {
        restartOnCrash: null,
        restartOnSourceChange: null,
        maxCrashRestarts: 0,
        pollSourceChanges: false,
        sourceChangeThreshold: 500,
        console: {
          stdout: false,
          stderr: false,
        },
        streams: [],
        notifications: [],
      },
      cliArgs: [],
      debug: null,
    }, inputConfig);

    // Are we in debug mode?
    this.config.debug = Boolean(this.config.cliArgs.indexOf('-d') > -1 || this.config.cliArgs.indexOf('--debug') > -1);

    // Initliase logger.
    this.log = new Logger(this.config.debug);
    this.log.title(`[Trawler v${packageJSON.version}] ${this.config.app.name} v${this.config.app.version}`);

    // We can't run ourselves.
    if (this.config.app.name === 'trawler-std') {
      this.log.error('You can\'t run Trawler on itself. You must install Trawler globally and run it on another app.');
      this.log.error('  $ npm install -g trawler-std');
      this.log.error('  $ trawler');
      process.exit(1);
    }

    // Are we overriding the environment from the CLI?
    const envArgIndex = (this.config.cliArgs.indexOf('-e') > -1 ? this.config.cliArgs.indexOf('-e') : this.config.cliArgs.indexOf('--env'));

    if (envArgIndex > -1 && this.config.cliArgs[envArgIndex + 1] && !this.config.cliArgs[envArgIndex + 1].match(/^\-/)) {
      this.config.app.env = this.config.cliArgs[envArgIndex + 1];
      this.envOverridden = true;
      this.log.important(`App environment: "${this.config.app.env}" (overridden by CLI argument).`);
    } else {
      this.envOverridden = false;
      this.log.important(`App environment: "${this.config.app.env}".`);
    }

    // Are we overriding the console.* configs via the CLI?
    if (this.config.cliArgs.indexOf('--stdout') > -1 || this.config.cliArgs.indexOf('--stdall') > -1) {
      this.config.trawler.console.stdout = true;
    }
    if (this.config.cliArgs.indexOf('--stderr') > -1 || this.config.cliArgs.indexOf('--stdall') > -1) {
      this.config.trawler.console.stderr = true;
    }

    // Private variables.
    this.hostname = os.hostname();
    this.numCrashRestarts = 0;
    this.internalStream = new stream.PassThrough();
    this.childApp = null;
    this.childAppStderrThreshold = 50;  // 50 milliseconds.
    this.childAppStderrBuffer = [];
    this.childAppStartTime = null;
    this.sourceChangeReady = false;
    this.sourceChangeTimeout = null;
    this.sourceChangeWatcher = null;
    this.sourceChangeIgnoredPaths = [];

    // Streams.
    this.streams = {
      file: require('./streams/file.stream.js'),
    };

    // Notification providers.
    this.notifications = {
      slack: require('./notifications/slack.notification.js'),
    };

    // Log if we have no streams specified.
    if (!this.config.trawler.streams || !this.config.trawler.streams.length) {
      this.log.warning('No streams specified: the app\'s log output will be lost.');
    }

  }

  /*
   * Initialises Trawler ready for use and starts the child app.
   * finish(err);
   */
  init (finish) {

    // Console log only.
    this.log.debug('Initialising Trawler...');

    // Prevent Trawler from exiting immediately after starting the child app.
    process.stdin.resume();

    // Initialise each of the streams.
    this.initSomething('streams', (err) => {

      if (err) { return finish(err); }

      // Initialise each of the notifications.
      this.initSomething('notifications', (err) => {

        if (err) { return finish(err); }

        // Start watching for source file changes?
        if (this.config.trawler.restartOnSourceChange) {

          this.log.debug('Preparing to watch for source file changes...');

          this.sourceChangeWatcher = chokidar.watch('.', {
            ignored: this.checkSourceChangeIgnoredFiles.bind(this),
            usePolling: this.config.trawler.pollSourceChanges,
            ignoreInitial: true,  //  Allow Chokidar's 'ready' event to fire as soon as possible.
          })
          .on('ready', () => {

            this.sourceChangeReady = true;

            // Boot the child app.
            this.log.debug('Trawler initialised.');
            this.startApp();
            return finish(null);

          })
          .on('all', this.onSourceChange.bind(this));

        } else {

          // Boot the child app.
          this.log.debug('Trawler initialised.');
          this.startApp();
          return finish(null);

        }

      });

    });

  }

  /*
   * Initialises either streams or notifications depending on what's given in the
   * 'what' parameter.
   * finish(err);
   */
  initSomething (what, finish) {

    this.log.debug(`Initialising ${what}:`);

    // Skip if we have nothing to initialise.
    if (!this.config.trawler[what]) { return finish(null); }
    async.forEachOf(this.config.trawler[what], (itemConfig, index, nextItem) => {

      this.log.debug(`>> ${itemConfig.type}...`);

      const envList = itemConfig.environments;
      const exludeEnvList = itemConfig.excludeEnvironments;

      // Positive environment check: the current environment must be in the stream/notification's "environments"
      // property OR no "environments" property specified.
      if (envList && envList.length && envList.indexOf(this.config.app.env) === -1) {
        this.log.debug('   Disabled due to "environments" property.');
        this.config.trawler[what][index] = null;
        return nextItem(null);
      }

      // Negative environment check: the current environment must not be in the stream/notification's
      // "excludeEnvironments" property OR no "excludeEnvironments" property specified.
      if (exludeEnvList && exludeEnvList.length && exludeEnvList.indexOf(this.config.app.env) > -1) {
        this.log.debug('   Disabled due to "excludeEnvironments" property.');
        this.config.trawler[what][index] = null;
        return nextItem(null);
      }

      const itemOptions = {
        internalStream: this.internalStream,  // Trawler's internal stream.
        mainConfig: this.config,  // The main Trawler config.
        itemConfig,  // The config for the stream/notification.
        boat: this,  // The instance of Trawler.
      };

      // Create a new item.
      // e.g. this.config.trawler.streams[0]
      // e.g. this.streams.file()
      this.config.trawler[what][index] = new this[what][itemConfig.type](itemOptions);

      // Initialise the item.
      // e.g. this.config.trawler.streams[0].init()
      this.config.trawler[what][index].init((err) => {
        if (err) { return nextItem(err); }
        return nextItem(null);
      });

    }, (err) => {

      if (err) { return finish(err); }

      // Remove all streams/notifications that are nulled.
      const newWhatArr = [];

      for (let i = 0, ilen = this.config.trawler[what].length; i < ilen; i++) {
        if (this.config.trawler[what][i]) { newWhatArr.push(this.config.trawler[what][i]); }
      }
      this.config.trawler[what] = newWhatArr;

      // Continue.
      this.log.debug('Done.');
      return finish(err);

    });

  }

  /*
   * Starts the child app.
   */
  startApp (_isManualRestart) {

    const isManualRestart = !Boolean(typeof _isManualRestart === 'undefined');
    const appName = this.config.app.name;
    const version = this.config.app.version;
    let message = `"${appName}" v${version}...`;

    // Figure out which message we need to display.
    if (isManualRestart) {
      message = `Restarting app ${message}`;
    } else if (this.numCrashRestarts) {
      message = `Restarting app (${this.numCrashRestarts + 1} starts) ${message}`;
    } else {
      message = `Starting app  ${message}`;
    }

    // Add starting message to log.
    this.outputLog('trawler', {
      message,
      trawlerLogType: 'success',
    });

    // Prepare the CLI arguments to start the app with.
    const spawnArgs = [this.config.app.mainFile];

    if (this.envOverridden) { spawnArgs.push('--env', this.config.app.env); }

    // Start the application.
    this.childApp = spawn('node', spawnArgs, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],  // stdin, stdout, stderr.
    });

    // Remember the start time.
    this.childAppStartTime = moment.utc();

    // Allow Trawler to exit independently of the child process.
    this.childApp.unref();

    // Handle child quitting and restart it if required.
    this.childApp.on('close', this.onAppCrash.bind(this));

    // Prepare stream handlers for child output.
    this.childApp.stdout.on('data', this.processChildAppOutput.bind(this, 'app-output'));
    this.childApp.stderr.on('data', this.processChildAppOutput.bind(this, 'app-error'));

    this.log.success('Ready!');

  }

  /*
   * Handles the child app when it crashes.
   */
  onAppCrash (code, signal) {

    // Skip if the interrupt signal was used to kill the app as this is either command line ^C or restartApp().
    if (signal === 'SIGINT') { return; }

    const that = this;
    const appName = this.config.app.name;
    const restartOnCrash = this.config.trawler.restartOnCrash;
    const maxCrashRestarts = this.config.trawler.maxCrashRestarts;
    const newNumCrashRestarts = this.numCrashRestarts + 1;

    async.waterfall([

      // Add crash alert to log.
      function logAppCrash (next) {

        // Output to logs.
        that.outputLog('trawler', {
          message: `App "${appName}" crashed ${newNumCrashRestarts} time(s)!`,
          trawlerLogType: 'error',
        });

        return next(null);

      },

      // Stop if restart is not allowed.
      function checkMaxCrashRestarts (next) {

        const tooManyRestarts = (maxCrashRestarts > 0 && newNumCrashRestarts >= maxCrashRestarts);
        const restartAction = (restartOnCrash && !tooManyRestarts ? 'restart' : 'quit');

        return next(null, tooManyRestarts, restartAction);

      },

      // Send notifications to external services.
      function notifyExternally (tooManyRestarts, restartAction, next) {

        let notificationType;

        if (!restartOnCrash) {
          notificationType = 'app-no-restart';
        } else if (tooManyRestarts) {
          notificationType = 'app-restart-limit';
        } else {
          notificationType = 'app-crash';
        }

        that.sendNotifications({
          notificationType,
          numCrashRestarts: newNumCrashRestarts + (restartOnCrash && maxCrashRestarts > 0 ? `/${maxCrashRestarts}` : ''),
          childAppStderrBuffer: that.getChildStderr(),
          childAppStartTime: that.childAppStartTime,
        }, (err) => {
          if (err) { return next(err); }
          return next(null, restartAction);
        });

      },

    ], (err, restartAction) => {

      // If we did get an error at this point, lets just crash.
      if (err) { throw err; }

      // Attempt to restart.
      if (restartAction === 'restart') {

        // Do the restart.
        that.numCrashRestarts = newNumCrashRestarts;
        return that.startApp();

      // Can't restart so we quit.
      } else if (restartAction === 'quit') {

        const msg = (!restartOnCrash ? 'Restart on crash is disabled!' : 'Max restarts reached!');

        // Quit the app AND Trawler.
        that.childApp = null;
        that.outputLog('trawler', {
          message: `${msg} Quitting...`,
          trawlerLogType: 'error',
        }, () => {  // Ignore error at this point.
          setTimeout(process.exit.bind(null, 1), 1000);  // Slight delay to allow streams to flush.
        });

      }

    });

  }

  /*
   * Manually kills the child app AND Trawler.
   */
  killApp () {

    this.log.debug(`Killing app "${this.config.app.name}"...`);

    // Tidy up the child app.
    if (this.childApp) {
      this.childApp.kill();
      this.childApp = null;
      this.childAppStartTime = null;
      this.lastSourceChange = null;
      this.clearChildStderr();
    }

    // Gracefully exit Trawler.
    this.log.debug('Goodbye.');
    process.exit(0);

  }

  /*
   * Kills and restarts the child app. This does not increment numCrashRestarts.
   */
  restartApp () {

    // Kill and tidy up.
    this.childApp.kill('SIGINT');  // Kill using the interrupt signal so we can capture it and prevent a restartOnCrash.
    this.childApp = null;
    this.lastSourceChange = null;
    this.clearChildStderr();

    // Restart.
    this.startApp(true);

  }

  /*
   * Restarts the app when a source file changes.
   */
  onSourceChange (event, path) {

    // Skip if no child app is running.
    if (!this.childApp || !this.sourceChangeReady) { return; }

    // Restart after a delay.
    if (this.sourceChangeTimeout) { clearTimeout(this.sourceChangeTimeout); }
    this.sourceChangeTimeout = setTimeout(() => {
      this.log.success('Source changes detected!');
      this.restartApp();
    }, this.config.trawler.sourceChangeThreshold);

  }

  /*
   * The 'ignored' handler for chokidar.
   */
  checkSourceChangeIgnoredFiles (checkPath, stats) {  // Must provide both arguments here for the method to get called.

    // Ignore .dot files.
    if (checkPath.match(/(?:^\/?|.*\/)\..+/)) { return true; }

    // Check against each of the ignored files.
    for (let i = 0, ilen = this.sourceChangeIgnoredPaths.length; i < ilen; i++) {
      const ignoredPath = this.sourceChangeIgnoredPaths[i];

      if (checkPath.match(ignoredPath)) { return true; }  // 'ignoredPath' is either a string or a RegExp.
    }

    // This path is allowed.
    return false;

  }

  /*
   * Prevents the source change watcher from checking the given dir. Used by the file stream to prevent the logs dir
   * from triggering app restarts. Either a string or RegExp can be passed in.
   * [Usage]
   *  addIgnoredSourceDir('/path/to/dir');
   *  addIgnoredSourceDir(/\/path\/to\/dir/);
   */
  addIgnoredSourceDir (dir) {

    // Skip if we aren't watching files for changes.
    if (!this.config.trawler.restartOnSourceChange) { return; }

    // Add the dir to ignore.
    if (this.sourceChangeIgnoredPaths.indexOf(dir) === -1) { this.sourceChangeIgnoredPaths.push(dir); }

  }

  /*
   * Writes the a log output to the internal stream.
   * finish(err);
   * [Usage]
   *  outputLog('entry-type', { ... }, callback);
   *  outputLog('entry-type', 'Message here!', callback);
   */
  outputLog (entryType, _options, _finish) {
    let options = (typeof _options === 'string' ? { message: _options } : _options);
    const finish = _finish || function () {};

    // Default options.
    options = extender.defaults({
      message: null,
      data: {},
      trawlerErr: null,
      trawlerLogType: 'message',
    }, options);

    // Construct the JSON output.
    const output = {
      name: this.config.app.name,
      hostname: this.hostname,
      pid: process.pid,
      time: moment.utc().toISOString(),
      appUptime: this.getAppUptime(),
      trawlerUptime: process.uptime() * 1000,  // Convert to milliseconds.
      entryType,
      message: options.message,
      data: options.data || {},
      trawlerErr: options.trawlerErr,
    };

    // The 'trawler' entires also get output to the console.
    if (entryType === 'trawler') {
      let logFn;

      switch (options.trawlerLogType) {
        case 'error': logFn = this.log.error; break;
        case 'title': logFn = this.log.title; break;
        case 'important': logFn = this.log.important; break;
        case 'success': logFn = this.log.success; break;
        case 'warning': logFn = this.log.warning; break;
        case 'message':
        default: logFn = this.log.message; break;
      }

      // We must call the log function with the correct context.
      logFn.call(this.log, options.trawlerErr || options.message || options.data);
    }

    // Keep the last error in memory in case the app crashes.
    if (entryType === 'app-error') { this.storeChildStderr(options.message); }

    // Write to the stream.
    this.internalStream.write(`${JSON.stringify(output)}\n`, (err) => {
      if (err) { return finish(err); }
      return finish(null);
    });

  }

  /*
   * Sends all the notifications.
   * callback(err);
   */
  sendNotifications (options, callback) {

    // Skip if we have no notifications to send.
    if (!this.config.trawler.notifications || !this.config.trawler.notifications.length) {
      this.log.debug('Unable to send notifications as no services have been specified.');
      return callback(null);
    }

    this.log.debug('Sending notifications:');

    // Notify each endpoint in turn.
    async.each(this.config.trawler.notifications, (notification, next) => {

      // If Trawler itself crashes before notifications are initialised.
      if (notification.isInitialised) {
        this.log.debug(`>> ${notification.cfg.type}`);
      } else {
        this.log.debug(`>> ${notification.type}`);
        this.log.debug('   Unable to send notification as the provider has not been initialised yet.');
        return next(null);
      }

      notification.send(options, (err) => {
        if (err) { return next(err); }
        return next(null);
      });

    }, (err) => {
      if (err) { return callback(err); }
      this.log.debug('Done.');
      return callback(null);
    });

  }

  /*
   * Converts output from the child app to usable log data.
   */
  processChildAppOutput (entryType, buf) {

    // Convert to string and remove the trailing line break.
    const bufstr = buf.toString().replace(/\n$/, '');

    // Are we outputting to the console?
    if (entryType === 'app-output' && this.config.trawler.console.stdout) { this.log.message(bufstr); }
    if (entryType === 'app-error' && this.config.trawler.console.stderr) { this.log.message(bufstr); }

    // Pass to the log.
    this.outputLog(entryType, bufstr);

  }

  /*
   * Returns the uptime of the child app.
   */
  getAppUptime () {
    return moment.utc().diff(this.childAppStartTime);
  }

  /*
   * Saves the given child stderr string in the buffer.
   */
  storeChildStderr (message) {

    const time = moment.utc();

    // Add the latest stderr to the end of the array.
    this.childAppStderrBuffer.push({
      time,
      message,
    });

    // Remove any of the old stderrs that are too old and need to be dropped.
    for (let i = 0, ilen = this.childAppStderrBuffer.length; i < ilen; i++) {
      if (time.diff(this.childAppStderrBuffer[0].time) > this.childAppStderrThreshold) {
        this.childAppStderrBuffer.shift();
      }
    }

  }

  /*
   * Returns all the child stderr in the buffer.
   */
  getChildStderr () {

    const output = [];

    for (let i = 0, ilen = this.childAppStderrBuffer.length; i < ilen; i++) {
      output.push(this.childAppStderrBuffer[i].message);
    }

    return output.join('\n');

  }

  /*
   * Provides a friendly method to emptu the child stderr buffer.
   */
  clearChildStderr () {
    this.childAppStderrBuffer = [];
  }

};
