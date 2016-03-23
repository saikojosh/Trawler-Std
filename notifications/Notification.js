'use strict';

/*
 * NOTIFICATION: base class.
 */

const extender = require('object-extender');
const moment = require('moment');
const packageJSON = require('../package.json');
const Logger = require('../modules/Logger');

module.exports = class NotificationBase {

  /*
   * Setup the provider.
   * [options]
   *  mainConfig - The main Trawler config.
   *  itemConfig - The config for the notification.
   *  internalStream - Trawler's internal stream.
   *  boat - The instance of Trawler.
   */
  constructor (classDefaults, options) {

    // Merge in the class' defaults, the item config and some read-only values.
    this.cfg = extender.extend(classDefaults, options.itemConfig, {
      // Read-only config.
      appName: options.mainConfig.app.name,
      env: options.mainConfig.app.env,
      version: options.mainConfig.app.version,
    });

    // Store the instance of Trawler.
    this.boat = options.boat;

    // Initliase logger.
    this.log = new Logger(options.mainConfig.debug);

  }

  /*
   * Prepares to send the notification and calls the 'doSend' method passed in from the child class which does the
   * actual sending.
   */
  send (_options, _finish, doSend) {

    const finish = _finish || function () {};

    const options = extender.defaults({
      notificationType: null,
      numCrashRestarts: null,
      childAppStderrBuffer: null,
      childAppStartTime: null,
      trawlerErr: null,
    }, _options);

    const appName = this.cfg.appName;
    const mode = this.cfg.env.toLowerCase();
    const version = `v${this.cfg.version}`;
    const startTime = options.childAppStartTime;
    let message;
    let stackTrace;

    // Prepare the appropriate message.
    switch (options.notificationType) {
      case 'app-no-restarts': message = 'The app is not allowed to crash because "restartOnCrash" is not set to true.'; break;
      case 'app-restart-limit': message = 'The app has crashed too many times and cannot be restarted again (max ' + options.numCrashRestarts + ' restart(s) allowed).'; stackTrace = options.childAppStderrBuffer; break;
      case 'app-crash': message = 'The app has crashed *' + options.numCrashRestarts + ' time(s)*!'; stackTrace = options.childAppStderrBuffer; break;
      case 'trawler-crash': message = 'Trawler itself has crashed!'; stackTrace = options.trawlerErr.stack; break;
      default: message = 'Something unexpected happened, it\'s probably worth checking out the application to make sure it\s still running.'; break;
    }

    const text = [
      ' ',
      '*Application:*',
      'Name: `' + appName + '`',
      'Mode: `' + mode + '`',
      'Version: `' + version + '`',
      ' ',
      '*Environment:*',
      'Node: `' + process.version + '`',
      'Trawler: `v' + packageJSON.version + '`',
      ' ',
      '*Status:*',
      'Boot Time: ' + (startTime ? '`' + startTime.format('YYYY-MM-DD') + '` `' + startTime.format('HH:mm:ss.SSS') + ' UTC` `(uptime ' + moment.utc().diff(options.childAppStartTime) + ' ms)`' : '`Not running`'),
      'Restarts: `' + (options.numCrashRestarts || 0) + '` restart(s) due to crashes.',
      'Code: `' + options.notificationType + '`',
      ' ',
      message,
      ' ',
      (stackTrace ? '```' + stackTrace + '```\n' : void(0)),
    ].join('\n');

    return doSend(null, options, finish, appName, mode, version, text);

  }

};
