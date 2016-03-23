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

    // Initliase logger.
    this.log = new Logger(options.mainConfig.debug);

  }

};
