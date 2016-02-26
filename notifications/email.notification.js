/*
 * NOTIFICATION: email.
 * Notifies an email address.
 */

var extender = require('object-extender');
//var ultimail = require('ultimail');

/*
 * Constructor.
 * [options]
 *  mainConfig
 *  itemConfig
 *  internalStream
 */
function EmailNotification (options) {

  this.cfg = extender.extend({
    // Default values.
    type: 'email'
  }, options.itemConfig, {
    // Private config.
  });

};

/*
 * Initialise the notification ready for use.
 * finish(err);
 */
EmailNotification.prototype.init = function (finish) {


  // TODO


  return finish(null);

};

/*
 * Send the notification.
 * finish(err);
 */
EmailNotification.prototype.notify = function (finish) {
  finish = finish || function(){};


  // TODO


};

/*
 * Export!
 */
module.exports = EmailNotification;
