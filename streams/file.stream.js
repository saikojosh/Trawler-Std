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

    that.rotateLogs(function (err, rotated) {

      if (err) { return finish(err); }

      // Ensure we create a new stream if we haven't rotated the logs, oitherwise rotateLogs() will handle stream creation.
      if (!rotated) { that.createStream(); }

      return finish(null);

    });

  });

};

/*
 * Create a new stream of this type.
 */
FileStream.prototype.createStream = function () {

  // Skip if stream already exists.
  if (this.stream) { return; }

  var logFile = pathify(this.cfg.logDir, this.cfg.logFilename);

  // Create new stream.
  this.stream = fs.createWriteStream(logFile, {
    flags: 'a'
  });

  // Link to the internal stream.
  this.internalStream.pipe(this.stream);

};

/*
 * Kills the existing stream of this type.
 */
FileStream.prototype.killStream = function () {

  // Skip if no stream exists.
  if (!this.stream) { return; }

  // Unlink from the internal stream.
  this.internalStream.unpipe(this.stream);

  // Close the stream.
  this.stream.end();

}

/*
 * Renames the old log files and creates a fresh one.
 * finish(err, rotated);
 */
FileStream.prototype.rotateLogs = function (finish) {
  finish = finish || function(){};

  // Skip if we don't need to rotate.
  if (!this.cfg.rotateLogs) { return finish(null); }

  var that          = this;
  var logDir        = that.cfg.logDir;
  var logFilename   = that.cfg.logFilename;
  var logFileRegStr = escapeRegExp(logFilename) + '(?:\\.(\\d+))?';
  var logFileRegExp = new RegExp(logFileRegStr, 'i');

  async.waterfall([

    function checkRotateTime (next) {

      that.isRotateRequired(logDir, logFilename, function (err, rotateRequired) {
        if (err) { return next(err); }
        return next(null, rotateRequired);
      });

    },

    function corkAndClose (rotateRequired, next) {

      if (!rotateRequired) { return next(null, rotateRequired); }

      // Cork the internal stream and stop it from flowing.
      that.internalStream.cork();

      // Kill the stream.
      that.killStream();

      return next(null, rotateRequired);

    },

    function readLogDir (rotateRequired, next) {

      if (!rotateRequired) {
        return next(null, rotateRequired, null, null, null);
      }

      // Read in the directory so we can check the existing logs.
      that.listLogFiles(logDir, logFileRegExp, function (err, logFiles, maxLogNum, maxLogFilename) {
        if (err) { return next(err); }
        return next(null, rotateRequired, logFiles, maxLogNum, maxLogFilename);
      });

    },

    function killOldestLog (rotateRequired, logFiles, maxLogNum, maxLogFilename, next) {

      if (!rotateRequired) { return next(null, rotateRequired, null); }

      // Skip if we still have at least one backlog slot remaining.
      if (typeof maxLogNum !== 'number' || maxLogNum < that.maxBackLogs - 1) {
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

      async.each(logFiles, function (item, nextItem) {

        var logNum      = (item.match[1] ? parseInt(item.match[1], 10) : 0) + 1;
        var oldFilename = pathify(logDir, item.filename);
        var newFilename = pathify(logDir, logFilename + '.' + logNum);

        // Do the rename.
        fs.rename(oldFilename, newFilename, function (err) {
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

      // Let the internal stream flow again.
      that.internalStream.uncork();

      return next(null, rotateRequired);

    }

  ], function (err, rotateRequired) {

    if (err) { return finish(err); }

    // Schedule the next log rotation.
    var now        = moment();
    var waitTimeMS = moment().endOf('day').add(1, 'milliseconds').diff(now);
    setTimeout(that.rotateLogs.bind(that), waitTimeMS);

    // All done!
    return finish(null, rotateRequired);

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

    // We have an empty file so lets drop out here.
    if (!firstLine) { return finish(null, false); }

    try {
      var entry = JSON.parse(firstLine);
    } catch (err) {
      return finish(new Error('Unable to parse JSON log file.'));
    }

    // Drop out here if we do not need to rotate the logs.
    var entryTime = moment(entry.time);
    if (moment().isSame(entryTime, 'day')) { return finish(null, false); }

    // Otherwise continue.
    return finish(null, true);

  });

};

/*
 * Passes a shallow list of files (not directories) in the given directory.
 * finish(err, logFiles, maxLogNum, maxLogFilename);
 */
FileStream.prototype.listLogFiles = function (logDir, logFileRegExp, finish) {

  // Read in the directory so we can check the existing logs.
  fs.readdir(logDir, function (err, files) {

    if (err) { return finish(err); }

    var logFiles       = [];
    var maxLogNum      = null;
    var maxLogFilename = null;

    // No logs found.
    if (!files || !files.length) { return finish(null, logFiles, maxLogNum, maxLogFilename); }

    // Filter just the files.
    async.each(files, function (filename, next) {

      // Check the type of each filename (e.g. file, directory, etc).
      fs.stat(pathify(logDir, filename), function (err, stats) {

        if (err) { return next(err); }

        // Skip anything that isn't a file e.g. directories.
        if (!stats.isFile()) { return next(null); }

        var match = logFileRegExp.exec(filename);

        // Skip if the file isn't one of our logs.
        if (!match) { return next(null); }

        // Remember each log file we find.
        logFiles.push({
          filename: filename,
          match:    match
        });

        return next(null);

      });

    }, function (err) {

      if (err) { return finish(err); }

      // Drop out here if no log files were found.
      if (!logFiles.length) { return finish(null, logFiles, maxLogNum, maxLogFilename); }

      // Sort the files, oldest first.
      logFiles = logFiles.sort(function (a, b) {
        return a.filename.toLowerCase() < b.filename.toLowerCase();
      });

      // Reset regular expression.
      logFileRegExp.exec('');

      var match = logFiles[0].filename.match(logFileRegExp);

      // Get the max log info from the oldest log file.
      if (match[1]) {
        maxLogNum      = parseInt(match[1], 10);
        maxLogFilename = match[0];
      }

      return finish(null, logFiles, maxLogNum, maxLogFilename);

    });

  });

};

/*
 * Export!
 */
module.exports = FileStream;
