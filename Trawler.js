'use strict';

/*
 * TRAWLER (class).
 */

const spawn = require('child_process').spawn;
const os = require('os');
const stream = require('stream');
const async = require('async');
const clc = require('cli-color');
const extender = require('object-extender');
const moment = require('moment');
const packageJSON = require('./package.json');

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
        maxRestarts: 0,
        streams: [],
        notifications: [],
      },
    }, inputConfig);

    // We can't run ourselves.
    if (this.config.app.name === 'trawler') {
      this.logError('You can\'t run Trawler on itself. You must install Trawler globally and run it on another app.');
      this.logError('  $ npm install -g trawler-std');
      this.logError('  $ trawler');
      process.exit(1);
    }

    // Private variables.
    this.hostname = os.hostname();
    this.numRestarts = 0;
    this.internalStream = new stream.PassThrough();
    this.childApp = null;
    this.childAppStderrThreshold = 50;  // 50 milliseconds.
    this.childAppStderrBuffer = [];
    this.childAppStartTime = null;

    // Streams.
    this.streams = {
      file: require('./streams/file.stream.js'),
    };

    // Notification providers.
    this.notifications = {
      slack: require('./notifications/slack.notification.js'),
    };

  }

  /*
   * Initialises Trawler ready for use and starts the child app.
   * finish(err);
   */
  init (finish) {

    // Console log only.
    this.logImportant(`[Trawler v${packageJSON.version}] ${this.config.app.name} v${this.config.app.version}`);

    // Prevent Trawler from exiting immediately after starting the child app.
    process.stdin.resume();

    // Initialise each of the streams.
    this.initSomething('streams', (err) => {

      if (err) { return finish(err); }

      // Initialise each of the notifications.
      this.initSomething('notifications', (err) => {

        if (err) { return finish(err); }

        // Boot the child app.
        this.startApp();
        return finish(null);

      });

    });

  }

  /*
   * Initialises either streams or notifications depending on what's given in the
   * 'what' parameter.
   * finish(err);
   */
  initSomething (what, finish) {

    // Skip if we have nothing to initialise.
    if (!this.config.trawler[what]) { return finish(null); }
    async.forEachOf(this.config.trawler[what], (itemConfig, index, nextItem) => {

      const itemOptions = {
        internalStream: this.internalStream,  // Trawler's internal stream.
        mainConfig: this.config,  // The main Trawler config.
        itemConfig,  // The config for the stream/notification.
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
      return finish(err);
    });

  }

  /*
   * Starts the child app.
   */
  startApp () {

    const appName = this.config.app.name;
    const version = this.config.app.version;
    const message = (this.numRestarts ? `Restarting app (${this.numRestarts + 1} starts)` : 'Starting app') + ` "${appName}" v${version}...`;

    // Add starting message to log.
    this.outputLog('trawler', {
      message,
      trawlerLogType: 'success',
    });

    // Start the application.
    this.childApp = spawn('node', [this.config.app.mainFile], {
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

  }

  /*
   * Handles the child app when it crashes.
   */
  onAppCrash (/* code, signal */) {

    const that = this;
    const appName = this.config.app.name;
    const restartOnCrash = this.config.trawler.restartOnCrash;
    const maxRestarts = this.config.trawler.maxRestarts;
    const newNumRestarts = this.numRestarts + 1;

    async.waterfall([

      // Add crash alert to log.
      function logAppCrash (next) {

        // Output to logs.
        that.outputLog('trawler', {
          message: `App "${appName}" crashed ${newNumRestarts} time(s)!`,
          trawlerLogType: 'error',
        });

        return next(null);

      },

      // Stop if restart is not allowed.
      function checkMaxRestarts (next) {

        const tooManyRestarts = (maxRestarts > 0 && newNumRestarts >= maxRestarts);
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
          numRestarts: newNumRestarts + (restartOnCrash && maxRestarts > 0 ? `/${maxRestarts}` : ''),
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
        that.numRestarts = newNumRestarts;
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

    // Tidy up the child app.
    if (this.childApp) {
      this.childApp.kill();
      this.childApp = null;
      this.childAppStartTime = null;
      this.clearChildStderr();
    }

    // Gracefully exit Trawler.
    process.exit(0);

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
        case 'error': logFn = this.logError; break;
        case 'important': logFn = this.logImportant; break;
        case 'success': logFn = this.logSuccess; break;
        case 'warning': logFn = this.logWarning; break;
        case 'message':
        default: logFn = this.logMessage; break;
      }

      logFn.call(this, options.trawlerErr || options.message || options.data);
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

    async.each(this.config.trawler.notifications, (notification, next) => {

      notification.send(options, (err) => {
        if (err) { return next(err); }
        return next(null);
      });

    }, (err) => {
      if (err) { return callback(err); }
      return callback(null);
    });

  }

  /*
   * Converts output from the child app to usable log data.
   */
  processChildAppOutput (entryType, buf) {
    this.outputLog(entryType, buf.toString());
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

  /*
   * Log out as ordinary text.
   */
  logMessage () {
    console.log.apply(console, arguments);  // Node doesn't support the spread operator without the harmony flag yet.
  }

  /*
   * Log out as important text.
   */
  logImportant () {
    this.logAsColour('yellowBright', ['bold', 'underline'], 'log', arguments);
  }

  /*
   * Log out as successful text.
   */
  logSuccess () {
    this.logAsColour('greenBright', null, 'log', arguments);
  }


  /*
   * Log out as warning text.
   */
  logWarning () {
    this.logAsColour('xterm:202', null, 'log', arguments);
  }

  /*
   * Logs out an error.
   */
  logError () {
    this.logAsColour('redBright', null, 'error', arguments);
  }

  /*
   * Allows us to log to the console in any colour we want.
   */
  logAsColour (colour, _styles, method, _arguments) {
    const styles = (typeof _styles === 'string' ? [_styles] : _styles) || [];
    const args = Array.prototype.slice.call(_arguments);
    const colourMatch = colour.match(/^([a-z]+)(?::(\d+))?$/i);
    const colourFn = (colourMatch[2] === 'xterm' ? clc.xterm(colourMatch[2]) : clc[colourMatch[1]]);
    const output = [];

    args.forEach((arg) => {

      // Add the colour.
      let str = colourFn(arg);

      // Add the styles in turn.
      for (let s = 0, slen = styles.length; s < slen; s++) {
        let styleMethodName = styles[s];

        str = clc[styleMethodName](str);
      }

      output.push(str);
    });

    console[method].apply(console, output);  // Node doesn't support the spread operator without the harmony flag yet.
  }

};
