'use strict';

/*
 * STREAM: base class.
 */

const extender = require('object-extender');
const Logger = require('../modules/Logger');

module.exports = class StreamBase {

  /*
  * Setup the provider.
  * [options]
  *  mainConfig - The main Trawler config.
  *  itemConfig - The config for the stream.
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

    // Allow us to check whether this stream has been set up.
    this.isInitialised = true;

    // Initliase logger.
    this.log = new Logger(options.mainConfig.debug);

  }

  /*
   * Initialise the stream ready for creation.
   */
  init () {

  }

  /*
   * Create a new stream of this type.
   */
  createStream () {

  }

  /*
   * Kills the existing stream of this type.
   */
  killStream () {

  }

  /*
   * Called the first time the child app starts.
   */
  onChildAppStart () {

  }

  /*
   * Called after the child app has restarted for any reason.
   */
  onChildAppRestart (/* reason */) {

  }

  /*
   * Called after the child app has been restarted manually.
   */
  onChildAppManualRestart () {

  }

  /*
   * Called after the child app has restarted because a source code change.
   */
  onChildAppSourceChangeRestart () {

  }

  /*
   * Called after the child app has restarted because of a crash.
   */
  onChildAppCrashRestart () {

  }

};
