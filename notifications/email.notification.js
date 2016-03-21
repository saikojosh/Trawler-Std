'use strict';

/*
 * NOTIFICATION: email.
 * Notifies an email address.
 */

const extender = require('object-extender');
// const ultimail = require('ultimail');

module.exports = class EmailNotification {

  /*
   * Constructor.
   * [options]
   *  mainConfig
   *  itemConfig
   *  internalStream
   */
  constructor (options) {

    this.cfg = extender.extend({
      // Default values.
      type: 'email',
    }, options.itemConfig, {
      // Private config.
    });

  }

  /*
   * Initialise the notification ready for use.
   * finish(err);
   */
  init (finish) {


    // TODO


    return finish(null);

  }

  /*
   * Send the notification.
   * finish(err);
   */
  notify (text, _finish) {
    const finish = _finish || function () {};


    // TODO


  }

};
