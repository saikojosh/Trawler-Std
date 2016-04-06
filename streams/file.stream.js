'use strict';

/*
 * STREAM: file.
 * Streams output to a file on disk.
 */

const fs = require('fs');
const readline = require('readline');
const pathify = require('path').join;
const async = require('async');
const escapeRegExp = require('escape-regexp');
const moment = require('moment');
const StreamBase = require('./Stream');

module.exports = class FileStream extends StreamBase {

  /*
   * Setup the stream.
   * [options]
   *  mainConfig - The main Trawler config.
   *  itemConfig - The config for the stream.
   *  internalStream - Trawler's internal stream.
   */
  constructor (options) {

    super({
      // Default values.
      type: 'file',
      location: null,
      logName: 'crash',
      rotateLogs: true,
      maxBackLogs: 6,
      crashOnError: true,
    }, options);

    // Where will the logs be stored?
    if (options.itemConfig.location[0] === '/') {  // Absolute path.
      this.logDir = pathify(options.itemConfig.location, options.mainConfig.app.name);
    } else {  // Relative path.
      this.logDir = pathify(process.cwd(), options.itemConfig.location, options.mainConfig.app.name);
    }

    // Ignore the logs directory for file changes.
    this.boat.addIgnoredSourceDir(options.itemConfig.location);

    // Private variables.
    this.logFilename = `${options.itemConfig.logName.toLowerCase()}.log`;
    this.streamErrorOccured = false;
    this.stream = null;
    this.internalStream = options.internalStream;

    this.log.debug(`   Log Directory: ${this.logDir}`);
    this.log.debug(`   Log Filename: ${this.logFilename}`);
    this.log.debug(`   Rotate Logs: ${this.cfg.rotateLogs ? 'Yes' : 'No'}`);
    this.log.debug(`   Maximum Back Logs: ${this.cfg.maxBackLogs}`);

  }

  /*
   * Initialise the stream ready for creation.
   * finish(err, stream);
   */
  init (finish) {

    this.log.debug(`   Initialising ${this.cfg.type} stream...`);

    // Create the app log dir.
    fs.mkdir(this.logDir, (err) => {

      // Ignore dir exists error.
      if (err && err.code !== 'EEXIST') {

        // Crash app.
        if (this.cfg.crashOnError) { return finish(err); }

        // Otherwise notify and ignore error.
        this.boat.outputLog('trawler', {
          message: 'Trawler is unable to create the log directory.',
          trawlerErr: err,
          trawlerLogType: 'error',
        });

        this.boat.sendNotifications({
          notificationType: 'trawler-error',
          message: `Trawler is unable to create the log directory (${err.code || err.name}).`,
          trawlerErr: err,
        });

        return finish(null);

      }

      // Rotate the log files if necessary.
      this.rotateLogs((err, rotated) => {

        if (err) {

          // Crash app.
          if (this.cfg.crashOnError) { return finish(err); }

          // Otherwise notify and ignore error.
          this.boat.outputLog('trawler', {
            message: 'Trawler is unable to rotate the log files.',
            trawlerErr: err,
            trawlerLogType: 'error',
          });

          this.boat.sendNotifications({
            notificationType: 'trawler-error',
            message: `Trawler is unable to rotate the log files (${err.code || err.name}).`,
            trawlerErr: err,
          });

          return finish(null);

        }

        // Ensure we create a new stream if we haven't rotated the logs, oitherwise rotateLogs() will handle stream
        // creation.
        if (!rotated) { this.createStream(); }

        this.log.debug('   Done.');
        return finish(null);

      });

    });

  }

  /*
   * Create a new stream of this type.
   */
  createStream () {

    // Skip if stream already exists.
    if (this.stream) { return; }

    const logFile = pathify(this.logDir, this.logFilename);

    // Create new stream.
    this.stream = fs.createWriteStream(logFile, {
      flags: 'a',
    });

    // Handle stream write errors.
    this.stream.on('error', (err) => {

      // Log the error.
      this.boat.outputLog('trawler', {
        message: 'Trawler is unable to write to the log file.',
        trawlerErr: err,
        trawlerLogType: 'error',
      });

      // Notify on the first write error per app start.
      if (!this.streamErrorOccured) {

        this.boat.sendNotifications({
          notificationType: 'trawler-error',
          trawlerErr: err,
          message: `Trawler is unable to write to the log file (${err.code || err.name}).\n_Until the app is restarted no further write errors will be reported._`,
        });

        this.streamErrorOccured = true;

      }

      // Re-open the stream.
      this.stream.close();
      this.stream = null;
      this.createStream();

    });

    // Link to the internal stream.
    this.internalStream.pipe(this.stream);

  }

  /*
   * Kills the existing stream of this type.
   */
  killStream () {

    // Skip if no stream exists.
    if (!this.stream) { return; }

    // Unlink from the internal stream.
    this.internalStream.unpipe(this.stream);

    // Close the stream.
    this.stream.end();

  }

  /*
   * Called the after the child app has restarted for any reason.
   */
  onChildAppRestart (/* reason */) {

    // Reset the flag.
    this.streamErrorOccured = false;

  }

  /*
   * Renames the old log files and creates a fresh one.
   * finish(err, rotated);
   */
  rotateLogs (_finish) {
    const finish = _finish || function () {};

    // Skip if we don't need to rotate.
    if (!this.cfg.rotateLogs) { return finish(null); }

    const that = this;
    const logDir = this.logDir;
    const logFilename = this.logFilename;
    const logFileRegStr = escapeRegExp(logFilename) + '(?:\\.(\\d+))?';
    const logFileRegExp = new RegExp(logFileRegStr, 'i');

    async.waterfall([

      function checkRotateTime (next) {

        that.isRotateRequired(logDir, logFilename, (err, rotateRequired) => {
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

        if (!rotateRequired) { return next(null, rotateRequired, null, null, null); }

        // Read in the directory so we can check the existing logs.
        that.listLogFiles(logDir, logFileRegExp, (err, logFiles, maxLogNum, maxLogFilename) => {
          if (err) { return next(err); }
          return next(null, rotateRequired, logFiles, maxLogNum, maxLogFilename);
        });

      },

      function killOlderLogs (rotateRequired, logFiles, maxLogNum, maxLogFilename, next) {

        if (!rotateRequired) { return next(null, rotateRequired, null); }

        const maxBackLogs = that.cfg.maxBackLogs;
        const trimmedLogFiles = [];

        // Skip if we still have at least one backlog slot remaining.
        if (typeof maxLogNum !== 'number' || maxLogNum < maxBackLogs - 1) {
          return next(null, rotateRequired, logFiles);
        }

        // Remove any older log files that will take us over the maximum number when we rotate.
        async.eachSeries(logFiles, (logFile, nextItem) => {

          // Keep the log file if it's less than the maximum number (and one free slot).
          if (parseInt(logFile.match[1], 10) < maxBackLogs - 1) {
            trimmedLogFiles.push(logFile);
            return nextItem(null);
          }

          // Otherwise remove it.
          fs.unlink(pathify(logDir, logFile.match[0]), (err) => {
            if (err) { return nextItem(err); }
            return nextItem(null);
          });

        }, (err) => {
          if (err) { return next(err); }
          return next(null, rotateRequired, trimmedLogFiles);
        });

      },

      function renameOtherLogs (rotateRequired, logFiles, next) {

        if (!rotateRequired) { return next(null, rotateRequired); }

        async.eachSeries(logFiles, (logFile, nextItem) => {

          const logNum = (logFile.match[1] ? parseInt(logFile.match[1], 10) + 1 : 0);
          const oldFilename = pathify(logDir, logFile.filename);
          const newFilename = pathify(logDir, `${logFilename}.${logNum}`);

          // Do the rename.
          fs.rename(oldFilename, newFilename, (err) => {
            if (err) { return nextItem(err); }
            return nextItem(null);
          });

        }, (err) => {
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

      },

    ], (err, rotateRequired) => {

      if (err) { return finish(err); }

      // Schedule the next log rotation.
      const now = moment.utc();
      const waitTimeMS = moment.utc().endOf('day').add(1, 'milliseconds').diff(now);

      setTimeout(that.rotateLogs.bind(that), waitTimeMS);

      // All done!
      return finish(null, rotateRequired);

    });

  }

  /*
   * Checks if we need to rotate the logs and passes a bool to the callback.
   * finish(err, rotateRequired);
   */
  isRotateRequired (logDir, logFilename, finish) {

    const logFile = pathify(logDir, logFilename);
    const logStream = fs.createReadStream(logFile);
    const lineReader = readline.createInterface({
      input: logStream,
    });
    let isError = false;
    let firstLine = '';

    // Handle log file stream errors.
    logStream.on('error', (err) => {

      // Prevent any further events firing.
      isError = true;
      logStream.destroy();
      lineReader.close();

      // Ignore file doesn't exist error.
      if (err.code === 'ENOENT') { return finish(null, false); } else { return finish(err); }

    });

    // Handle reading of log file lines.
    lineReader.on('line', (line) => {

      // The line reader keeps firing this event even after it has closed??!
      if (lineReader.closed) { return; }

      // Line reader doesn't respect the input stream closing so we do a manual check.
      if (isError) { return; }

      // We only want the first line.
      firstLine = line;
      lineReader.close();

    });

    // Once we have the first line of the log file.
    lineReader.on('close', () => {

      // Line reader doesn't respect the input stream closing so we do a manual check.
      if (isError) { return; }

      // We have an empty file so lets drop out here.
      if (!firstLine) { return finish(null, false); }

      let entry;
      let entryTime;

      try {
        entry = JSON.parse(firstLine);
      } catch (err) {
        return finish(new Error('Unable to parse JSON log file.'));
      }

      // Drop out here if we do not need to rotate the logs.
      entryTime = moment(entry.time);
      if (moment.utc().isSame(entryTime, 'day')) { return finish(null, false); }

      // Otherwise continue.
      return finish(null, true);

    });

  }

  /*
   * Passes a shallow list of files (not directories) in the given directory.
   * finish(err, logFiles, maxLogNum, maxLogFilename);
   */
  listLogFiles (logDir, logFileRegExp, finish) {

    // Read in the directory so we can check the existing logs.
    fs.readdir(logDir, (err, files) => {

      if (err) { return finish(err); }

      const logFiles = [];
      let maxLogNum = null;
      let maxLogFilename = null;

      // No logs found.
      if (!files || !files.length) { return finish(null, logFiles, maxLogNum, maxLogFilename); }

      // Filter just the files.
      async.each(files, (filename, next) => {

        // Check the type of each filename (e.g. file, directory, etc).
        fs.stat(pathify(logDir, filename), (err, stats) => {

          if (err) { return next(err); }

          // Skip anything that isn't a file e.g. directories.
          if (!stats.isFile()) { return next(null); }

          const match = logFileRegExp.exec(filename);

          // Skip if the file isn't one of our logs.
          if (!match) { return next(null); }

          // Remember each log file we find.
          logFiles.push({
            filename,
            match,
          });

          return next(null);

        });

      }, (err) => {

        if (err) { return finish(err); }

        // Drop out here if no log files were found.
        if (!logFiles.length) { return finish(null, logFiles, maxLogNum, maxLogFilename); }

        // Sort the files, oldest first.
        logFiles.sort((a, b) => {
          return a.filename.toLowerCase() < b.filename.toLowerCase();
        });

        // Reset regular expression.
        const match = logFiles[0].filename.match(logFileRegExp);

        // Get the max log info from the oldest log file.
        if (match[1]) {
          maxLogNum = parseInt(match[1], 10);
          maxLogFilename = match[0];
        }

        return finish(null, logFiles, maxLogNum, maxLogFilename);

      });

    });

  }

};
