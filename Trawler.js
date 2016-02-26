/*
 * TRAWLER (class).
 */

var fs           = require('fs');
var os           = require('os');
var stream       = require('stream');
var async        = require('async');
var escapeRegExp = require('escape-regexp');
var fetch        = require('node-fetch');
var extender     = require('object-extender');
var moment       = require('moment');

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
      type:           null,
      location:       null,
      logName:        null,
      rotateLogs:     true,
      maxBackLogs:    6,
      restartOnError: null,
      maxRestarts:    5,
      notifications:  []
    }
  }, inputConfig);

  // Private variables.
  this.hostname              = os.hostname();
  this.numRestarts           = 0;
  this.internalStream        = new stream.PassThrough();
  this.externalStream        = null;
  this.childApp              = null;
  this.logDir                = null;
  this.logFilename           = this.config.trawler.logName.toLowerCase() + '.log';
  this.canRotateLogs         = false;
  this.rotateTimeout         = null;
  this.externalStreamManager = this.streams[this.config.trawler.type];

};

/*
 * Contains the various supported streams for logs.
 */
Trawler.prototype.streams = {

  /*
   * Streams output logs to disk.
   */
  file: {

    /*
     * Initialise the stream ready for creation.
     * callback(err);
     */
    init: function (finish) {

      // Build the dir path.
      this.logDir = pathify(
        __dirname,
        this.config.trawler.location,
        this.config.app.name
      );

      // Yes, we can rotate file-based logs.
      this.canRotateLogs = true;

      // Create the app log dir.
      var that = this;
      fs.mkdir(this.logDir, function (err) {

        // Ignore dir exists error.
        if (err && err.code !== 'EEXIST') { return finish(err); }

        // Create the initial stream.
        that.externalStreamManager.createStream.call(that);

        return finish(null);

      });

    },

    /*
     * Create a new stream of this type.
     */
    createStream: function () {
      this.externalStream = fs.createWriteStream(this.logFilename, {
        flags: 'a'
      });
    }

  }

};

/*
 * Contains methods for various notification providers.
 */
Trawler.prototype.notifications = {

  /*
   * Notifies via email.
   */
  email: {

    cfg: {},

    /*
     * Setup the mailer.
     */
    init: function (notificationCfg) {
      this.notifications[notificationCfg.type].cfg = notificationCfg;
    },

    /*
     * Send an email notification.
     * finish(err);
     */
    notify: function (text, finish) {

    }

  },

  /*
   * Notifies to a Slack channel.
   */
  slack: {

    cfg: {},

    /*
     * Setup the Slack webhook.
     */
    init: function (notificationCfg) {
      this.notifications['slack'].cfg = notificationCfg;
    },

    /*
     * Send a Slack notification.
     * finish(err);
     */
    notify: function (text, finish) {
      finish = finish || function(){};

      var cfg     = this.notifications['slack'].cfg;
      var appName = this.config.app.name;
      var mode    = this.config.app.env.toUpperCase();

      fetch(this.cfg.url, {
        method: 'GET',
        body:   JSON.stringify({
          text:       '[' + appName + '] [' + mode + '] ' + text,
          username:   cfg.username,
          icon_emoji: cfg.icon_emoji,
          icon_url:   cfg.icon_url
        })
      })
      .then(function(res) {
        return finish(null);
      });

    }

  }

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
  this.externalStreamManager.init.call(this, function (err) {

    if (err) { throw err; }

    // Boot the child app after rotating logs.
    if (that.canRotateLogs && that.config.trawler.rotateLogs) {

      // Rotate on boot.
      that.rotateLogs(function (err) {

        if (err) { return finish(err); }

        // Boot the child app.
        that.startApp();
        return finish(null);

      });

    }

    // Boot the child app immediately.
    else {
      that.startApp();
      return finish(null);
    }

  });

};

/*
 * Starts the child app.
 */
Trawler.prototype.startApp = function () {

  var appName = this.config.app.name;
  var version = this.config.app.version;

  // Add starting message to log.
  this.output('Starting app "' + appName + '" v' + version + '...');

  // Start the application.
  var child = spawn('node', this.config.app.mainFile, {
    detached: true,
    stdio:    ['ignore', 'pipe', 'pipe']  //stdin, stdout, stderr.
  });

  // Allow Trawler to exit independently of the child process.
  child.unref();

  // Handle child quitting and restart it if required.
  child.on('close', this.onAppCrash.bind(this));

  // Prepare stream handlers for child output.
  child.stdout.on('data', this.output.bind(this));
  child.stderr.on('data', this.output.bind(this));

};

/*
 * Handles the child app when it crashes.
 */
Trawler.prototype.onAppCrash = function (code, signal) {

  var appName        = this.config.app.name;
  var restartOnError = this.config.trawler.restartOnError;
  var maxRestarts    = this.config.trawler.maxRestarts;

  // Add crash alert to log.
  this.output('App "' + appName + '" crashed ' + (this.numRestarts + 1) + ' time(s)!');

  // Stop if restart is not allowed.
  if (!restartOnError || (maxRestarts > 0 && this.numRestarts >= maxRestarts)) {
    this.childApp = null;
    this.output('Max restarts reached. Quitting...', function (err) {
      process.exit(1);
    });
  }

  this.numRestarts++;

  // Add restarting number to log.
  this.output('Restart #' + this.numRestarts);

  // Do the restart.
  return this.start();

};

/*
 * Kills the child app AND Trawler.
 */
Trawler.prototype.killApp = function () {
  if (this.childApp) { this.childApp.kill(); }
  process.exit(0);
};

/*
 * Writes the output from the child to the internal stream.
 * finish(err);
 * [Usage]
 *  output({ ... }, callback);
 *  output('Message here!', callback);
 */
Trawler.prototype.output = function (options, finish) {
  options = (typeof options === 'string' ? options = { message: options } : options);
  finish  = finish || function(){};

  options = extender.defaults({
    entryType:  'log',
    message:    null,
    data:       {},
    trawlerErr: null
  }, options);

  // Construct the JSON output.
  var output = {
    name:       this.config.app.name,
    hostname:   this.hostname,
    pid:        process.pid,
    time:       moment().toISODate(),
    appUptime:  process.uptime() * 1000,  //convert to milliseconds.
    entryType:  options.entryType,
    message:    options.message,
    data:       options.data || {},
    trawlerErr: options.trawlerErr
  };

  // Write to the stream.
  var json = JSON.stringify(output) + '\n';
  this.internalStream.write(json, finish);

};

/*
 * Renames the old log files and creates a fresh one.
 * finish(err);
 */
Trawler.prototype.rotateLogs = function (finish) {

  // Skip if we don't need to rotate.
  if (!this.canRotateLogs || !this.config.trawler.rotateLogs) {
    return finish(null);
  }

  var that          = this;
  var logFileRegStr = '^' + escapeRegExp(this.logFilename + '(?:\.(\d+))?');
  var logFileRegExp = new RegExp(logFileRegStr);

  async.waterfall([

    function checkRotateTime (next) {

      var firstLine;

      new BufferedReader(that.logFilename, { encoding: 'utf8' })
      .on('error', function (err) {
        throw err;
      })
      .on('line', function (line) {
        firstLine = line.replace(/,$/, '');
        this.interrupt();
      })
      .on('end', function () {

        var entry     = JSON.parse(firstLine);
        var entryTime = moment(entry.time);

        // Drop out here if we do not need to rotate the logs.
        if (moment().isSame(entryTime, 'day')) { return finish(null); }

        // Otherwise continue.
        return next(null);

      })
      .read();

    },

    function corkAndClose (next) {

      // Cork and unlink the internal stream.
      that.internalStream.cork();
      that.internalStream.unpipe(that.externalStream);

      // Close the external stream.
      that.externalStream.end();

      return next(null);

    },

    function readLogDir (next) {

      // Read in the directory so we can check the existing logs.
      fs.readdir(that.logDir, function (err, files) {

        if (err) { return next(err); }

        var logFiles       = [];
        var maxLogNum      = null;
        var maxLogFilename = null;

        // Sort the files, oldest first.
        files = files.sort(function (a, b) { return a < b; });

        // Check which log files we already have.
        for (var i = 0, ilen = files.length ; i < ilen ; i++) {
          var filename = files[i];
          var match    = logFileRegExp.exec(filename);

          // Skip if the file isn't one of our logs.
          if (!match) { continue; }

          // Remember each log file we find.
          logFiles.push(filename);
          if (i === 0 && match[1]) {
            maxLogNum      = parseInt(match[1], 10);
            maxLogFilename = match[0];
          }

        }

        // Continue.
        return next(null, logFiles, maxLogNum, maxLogFilename);

      });

    },

    function killOldestLog (logFiles, maxLogNum, maxLogFilename, next) {

      // Skip if we still have one backlog slot remaining.
      if (maxLogNum < that.maxBackLogs - 1) { return next(null, logFiles); }

      // Remove the first (oldest) log file from the array.
      logFiles.shift();

      // If we have too many logs, kill the oldest one.
      fs.unlink(maxLogFilename, function (err) {
        if (err) { return next(err); }
        return next(null, logFiles);
      });

    },

    function renameOtherLogs (logFiles, next) {

      // Reset the RegExp just in case the first string we exec is the same as the previous one.
      logFileRegExp.exec('');

      async.each(logFiles, function (filename, nextItem) {

        var match = filename.match(logFileRegExp);

        // Do the rename.
        var newFilename = logFilename + '.' + (parseInt(match[1], 10) + 1);
        fs.rename(filename, newFilename, function (err) {
          if (err) { return nextItem(err); }
          return nextItem(null);
        });

      }, function (err) {
        if (err) { return next(err); }
        return next(null);
      });

    },

    function uncorkAndOpen () {

      // Open a new external stream.
      that.externalStreamManager.createStream();

      // Uncork and link the internal stream.
      that.internalStream.pipe(that.externalStream);
      that.internalStream.uncork();

      // Chain the next check.
      that.rotateTimeout = setTimeout(
        that.rotateLogs.bind(that),
        that.rotateCheckMS
      );

      return next(null);

    }

  ], function (err) {

    if (err) { return finish(err); }

    // Schedule the next log rotation.
    var now        = moment();
    var waitTimeMS = moment().endOf('day').add(1, 'milliseconds').diff(now);
    setTimeout(that.rotateLogs.bind(that), waitTimeMS);

    // All done!
    return finish(null);

  });

};

/*
 * Export.
 */
module.exports = Trawler;
