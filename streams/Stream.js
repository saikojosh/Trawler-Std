'use strict';

/*
 * STREAM: base class.
 */

const extender = require('object-extender');

module.exports = class StreamBase {

  /*
  * Setup the provider.
  * [options]
  *  mainConfig - The main Trawler config.
  *  itemConfig - The config for the stream.
  *  internalStream - Trawler's internal stream.
   */
  constructor (classDefaults, options) {

    // Merge in the class' defaults, the item config and some read-only values.
    this.cfg = extender.extend(classDefaults, options.itemConfig, {
      // Read-only config.
      appName: options.mainConfig.app.name,
      env: options.mainConfig.app.env,
      version: options.mainConfig.app.version,
    });

  }

};
