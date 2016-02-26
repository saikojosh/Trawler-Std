/*
 * STREAM: file.
 * Streams output to a file on disk.
 */

var fs           = require('fs');
var pathify      = require('path').join;
var async        = require('async');
var binaryReader = require('binary-reader');
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

    that.rotateLogs(false, function (err) {

      if (err) { return finish(err); }

      // Create the initial stream.
      stream = that.createStream.call(that);

      return finish(null, stream);

    });

  });

};

/*
 * Create a new stream of this type and returns it.
 */
FileStream.prototype.createStream = function () {
  return this.stream = fs.createWriteStream(this.cfg.logFilename, {
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

      var firstLine = '';

      binaryReader.open(that.cfg.logFilename)
      .on('error', function (err) {
        return finish(err);
      })
      .read(1, function (bytesRead, buf, next) {
        var nextByte = buf.toString();
        firstLine += nextByte;
        if (nextByte.match(/\r\n?|\n/)) { this.interrupt(); }
        return next(null);
      })
      .on('close', function () {

        var entry     = JSON.parse(firstLine.replace(/,$/, ''));
        var entryTime = moment(entry.time);

        // Drop out here if we do not need to rotate the logs.
        if (moment().isSame(entryTime, 'day')) { return finish(null); }

        // Otherwise continue.
        return next(null);

      })
      .close();

    },

    function corkAndClose (next) {

      // Cork and unlink the internal stream.
      that.internalStream.cork();
      that.internalStream.unpipe(that.stream);

      // Close the stream.
      that.stream.end();

      return next(null);

    },

    function readLogDir (next) {

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
        var newFilename = that.cfg.logFilename + '.' + (parseInt(match[1], 10) + 1);
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
 * Export!
 */
module.exports = FileStream;
