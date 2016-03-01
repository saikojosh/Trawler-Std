/*
 * STREAM: file.
 * Streams output to a file on disk.
 */

var fs           = require('fs');
var readline     = require('readline');
var pathify      = require('path').join;
var async        = require('async');
var escapeRegExp = require('escape-regexp');
var moment       = require('moment');
var extender     = require('object-extender');

/*
 * Constructor.
 * [options]
 *  mainConfig
 *  itemConfig
 *  internalStream
 */
function FileStream (options) {

  this.cfg = extender.extend({
    // Default values.
    type:        'file',
    location:    null,
    logName:     'crash',
    rotateLogs:  true,
    maxBackLogs: 6
  }, options.itemConfig, {
    // Private config.
    logDir:      pathify(options.itemConfig.location, options.mainConfig.app.name),
    logFilename: options.itemConfig.logName.toLowerCase() + '.log'
  });

  this.stream         = null;
  this.internalStream = options.internalStream;

};

/*
 * Initialise the stream ready for creation.
 * finish(err, stream);
 */
FileStream.prototype.init = function (finish) {

  // Create the app log dir.
  var that = this;
  fs.mkdir(this.cfg.logDir, function (err) {

    // Ignore dir exists error.
    if (err && err.code !== 'EEXIST') { return finish(err); }

    that.rotateLogs(function (err) {

      if (err) { return finish(err); }

      // Create the initial stream.
      that.createStream.call(that);

      return finish(null);

    });

  });

};

/*
 * Create a new stream of this type and returns it.
 */
FileStream.prototype.createStream = function () {

  var logFile = pathify(this.cfg.logDir, this.cfg.logFilename);

  // Create new stream.
  this.stream = fs.createWriteStream(logFile, {
    flags: 'a'
  });
};

/*
 * Renames the old log files and creates a fresh one.
 * finish(err);
 */
FileStream.prototype.rotateLogs = function (finish) {
  finish = finish || function(){};

  // Skip if we don't need to rotate.
  if (!this.cfg.rotateLogs) { return finish(null); }

  var that          = this;
  var logFileRegStr = '^' + escapeRegExp(this.cfg.logFilename + '(?:\.(\d+))?');
  var logFileRegExp = new RegExp(logFileRegStr);

  async.waterfall([

    function checkRotateTime (next) {

      var logDir      = that.cfg.logDir;
      var logFilename = that.cfg.logFilename;

      that.isRotateRequired(logDir, logFilename, function (err, rotateRequired) {
        if (err) { return next(err); }
        return next(null, rotateRequired);
      });

    },

    function corkAndClose (rotateRequired, next) {

      if (!rotateRequired) { return next(null, rotateRequired); }

      // Cork and unlink the internal stream.
      that.internalStream.cork();
      that.internalStream.unpipe(that.stream);

      // Close the stream.
      that.stream.end();

      return next(null, rotateRequired);

    },

    function readLogDir (rotateRequired, next) {

      if (!rotateRequired) {
        return next(null, rotateRequired, null, null, null);
      }

      // Read in the directory so we can check the existing logs.
      fs.readdir(that.cfg.logDir, function (err, files) {

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
        return next(null, rotateRequired, logFiles, maxLogNum, maxLogFilename);

      });

    },

    function killOldestLog (rotateRequired, logFiles, maxLogNum, maxLogFilename, next) {

      if (!rotateRequired) { return next(null, rotateRequired, null); }

      // Skip if we still have one backlog slot remaining.
      if (maxLogNum < that.maxBackLogs - 1) {
        return next(null, rotateRequired, logFiles);
      }

      // Remove the first (oldest) log file from the array.
      logFiles.shift();

      // Kill the oldest one.
      fs.unlink(maxLogFilename, function (err) {
        if (err) { return next(err); }
        return next(null, rotateRequired, logFiles);
      });

    },

    function renameOtherLogs (rotateRequired, logFiles, next) {

      if (!rotateRequired) { return next(null, rotateRequired); }

      // Reset the RegExp just in case the first string we exec is the same as the previous one.
      logFileRegExp.exec('');

      async.each(logFiles, function (filename, nextItem) {

        var match = filename.match(logFileRegExp);

        // Do the rename.
        var newFilename = that.cfg.logFilename + '.' + (parseInt(match[1], 10) + 1);
        fs.rename(filename, newFilename, function (err) {
          if (err) { return nextItem(err); }
          return nextItem(null);
        });

      }, function (err) {
        if (err) { return next(err); }
        return next(null, rotateRequired);
      });

    },

    function uncorkAndOpen (rotateRequired, next) {

      if (!rotateRequired) { return next(null, rotateRequired); }

      // Open a new stream.
      that.createStream();

      // Uncork and link the internal stream.
      that.internalStream.pipe(that.stream);
      that.internalStream.uncork();

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
 * Checks if we need to rotate the logs and passes a bool to the callback.
 * finish(err, rotateRequired);
 */
FileStream.prototype.isRotateRequired = function (logDir, logFilename, finish) {

  var isError    = false;
  var logFile    = pathify(logDir, logFilename);
  var logStream  = fs.createReadStream(logFile);
  var lineReader = readline.createInterface({
    input: logStream
  });
  var firstLine = '';

  // Handle log file stream errors.
  logStream.on('error', function (err) {

    // Prevent any further events firing.
    isError = true;
    logStream.destroy();
    lineReader.close();

    // Ignore file doesn't exist error.
    if (err.code === 'ENOENT') { return finish(null, false); }
    else                       { return finish(err);         }

  });

  // Handle reading of log file lines.
  lineReader.on('line', function (line) {

    // The line reader keeps firing this event even after it has closed??!
    if (lineReader.closed) { return; }

    // Line reader doesn't respect the input stream closing so we do a manual check.
    if (isError) { return; }

    // We only want the first line.
    firstLine = line;
    lineReader.close();

  });

  // Once we have the first line of the log file.
  lineReader.on('close', function () {

    // Line reader doesn't respect the input stream closing so we do a manual check.
    if (isError) { return; }

    try {
      var entry = JSON.parse(firstLine);
    } catch (err) {
      return next(new Error('Unable to parse JSON log file.'));
    }

    // Drop out here if we do not need to rotate the logs.
    var entryTime = moment(entry.time);
    if (moment().isSame(entryTime, 'day')) { return finish(null, false); }

    // Otherwise continue.
    return finish(null, true);

  });

};

/*
 * Export!
 */
module.exports = FileStream;
