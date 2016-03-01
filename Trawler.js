/*
 * TRAWLER (class).
 */

var spawn    = require('child_process').spawn;
var os       = require('os');
var stream   = require('stream');
var async    = require('async');
var extender = require('object-extender');
var moment   = require('moment');

/*
 * Constructor.
 */
function Trawler (inputConfig) {

  // Default config.
  this.config = extender.defaults({
    app: {
      name:    'unknown',
      version: 'unknown',
      mainFile: null,
      env:      'development'
    },
    trawler: {
      restartOnCrash: null,
      maxRestarts:    0,
      streams:        [],
      notifications:  []
    }
  }, inputConfig);

  // We can't run ourselves.
  if (this.config.app.name === 'trawler') {
    console.error('You can\'t run Trawler on itself. You must install Trawler globally and run it on another app.');
    process.exit(1);
  }

  // Private variables.
  this.hostname       = os.hostname();
  this.numRestarts    = 0;
  this.internalStream = new stream.PassThrough();
  this.childApp       = null;

};

/*
 * Contains the various supported streams for logs.
 */
Trawler.prototype.streams = {
  file: require('./streams/file.stream.js')
};

/*
 * Contains methods for various notification providers.
 */
Trawler.prototype.notifications = {
  email: require('./notifications/email.notification.js'),
  slack: require('./notifications/slack.notification.js')
};

/*
 * Initialises Trawler ready for use and starts the child app.
 * finish(err);
 */
Trawler.prototype.init = function (finish) {

  // Prevent Trawler from exiting immediately after starting the child app.
  process.stdin.resume();

  // Setup the stream.
  var that = this;

  // Initialise each of the streams.
  this.initSomething('streams', function (err) {

    if (err) { return finish(err); }

    // Initialise each of the notifications.
    that.initSomething('notifications', function (err) {

      if (err) { return finish(err); }

      // Boot the child app.
      that.startApp();
      return finish(null);

    });

  });

};

/*
 * Initialises either streams or notifications depending on what's given in the
 * 'what' parameter.
 * finish(err);
 */
Trawler.prototype.initSomething = function (what, finish) {

  // Skip if we have nothing to initialise.
  if (!this.config.trawler[what]) { return finish(null); }

  var that = this;
  async.forEachOf(this.config.trawler[what], function (itemConfig, index, nextItem) {

    itemOptions = {
      mainConfig:     that.config,
      itemConfig:     itemConfig,
      internalStream: that.internalStream
    };

    // Create a new item.
    // e.g. that.config.trawler.streams[0]
    // e.g. that.streams.file()
    that.config.trawler[what][index] = new that[what][itemConfig.type](itemOptions);

    // Initialise the item.
    // e.g. that.config.trawler.streams[0].init()
    that.config.trawler[what][index].init(function (err) {
      if (err) { return nextItem(err); }
      return nextItem(null);
    });

  }, function (err) {
    if (err) { return finish(err); }
    return finish(err);
  });

};

/*
 * Starts the child app.
 */
Trawler.prototype.startApp = function () {

  var appName = this.config.app.name;
  var version = this.config.app.version;

  // Add starting message to log.
  this.outputLog('trawler', 'Starting app "' + appName + '" v' + version + '...');

  // Start the application.
  this.childApp = spawn('node', [this.config.app.mainFile], {
    detached: true,
    stdio:    ['ignore', 'pipe', 'pipe']  //stdin, stdout, stderr.
  });

  // Allow Trawler to exit independently of the child process.
  this.childApp.unref();

  // Handle child quitting and restart it if required.
  this.childApp.on('close', this.onAppCrash.bind(this));

  // Prepare stream handlers for child output.
  this.childApp.stdout.on('data', this.processChildAppOutput.bind(this, 'app-output'));
  this.childApp.stderr.on('data', this.processChildAppOutput.bind(this, 'app-error'));

};

/*
 * Handles the child app when it crashes.
 */
Trawler.prototype.onAppCrash = function (code, signal) {

  var appName        = this.config.app.name;
  var restartOnCrash = this.config.trawler.restartOnCrash;
  var maxRestarts    = this.config.trawler.maxRestarts;

  // Add crash alert to log.
  this.outputLog('trawler', 'App "' + appName + '" crashed ' + (this.numRestarts + 1) + ' time(s)!');

  // Stop if restart is not allowed.
  if (!restartOnCrash || (maxRestarts > 0 && this.numRestarts >= maxRestarts)) {
    var msg = (!restartOnCrash ? 'Restart on crash is disabled.' : 'Max restarts reached.');
    this.childApp = null;
    this.outputLog('trawler', msg + ' Quitting...', function (err) {
      process.exit(1);
    });
    return;
  }

  this.numRestarts++;

  // Add restarting number to log.
  this.outputLog('trawler', 'Restart #' + this.numRestarts);

  // Do the restart.
  return this.startApp();

};

/*
 * Kills the child app AND Trawler.
 */
Trawler.prototype.killApp = function () {
  if (this.childApp) { this.childApp.kill(); }
  process.exit(0);
};

/*
 * Writes the a log output to the internal stream.
 * finish(err);
 * [Usage]
 *  outputLog('entry-type', { ... }, callback);
 *  outputLog('entry-type', 'Message here!', callback);
 */
Trawler.prototype.outputLog = function (entryType, options, finish) {
  options = (typeof options === 'string' ? options = { message: options } : options);
  finish  = finish || function(){};

  // Default options.
  options = extender.defaults({
    message:    null,
    data:       {},
    trawlerErr: null
  }, options);

  // Construct the JSON output.
  var output = {
    name:       this.config.app.name,
    hostname:   this.hostname,
    pid:        process.pid,
    time:       moment().toISOString(),
    appUptime:  process.uptime() * 1000,  //convert to milliseconds.
    entryType:  entryType,
    message:    options.message,
    data:       options.data || {},
    trawlerErr: options.trawlerErr
  };

  // 'trawler' entires also get output to the console.
  if (entryType === 'trawler') {
    console.log(options.trawlerErr || options.message || options.data);
  }

  // Write to the stream.
  var json = JSON.stringify(output) + '\n';
  this.internalStream.write(json, finish);

};

/*
 * Converts output from the child app to usable log data.
 */
Trawler.prototype.processChildAppOutput = function (entryType, buf) {
  this.outputLog(entryType, buf.toString());
};

/*
 * Export.
 */
module.exports = Trawler;
