/*
 * NOTIFICATION: slack.
 * Notifies a Slack channel.
 */

var fetch    = require('node-fetch');
var extender = require('object-extender');

/*
 * Constructor.
 * [options]
 *  mainConfig
 *  itemConfig
 *  internalStream
 */
function SlackNotification (options) {

  this.cfg = extender.extend({
    // Default values.
    type:      'slack',
    url:       null,
    username:  'Trawler',
    iconEmoji: ':anchor:'
  }, options.itemConfig, {
    // Private config.
    appName:   options.mainConfig.app.name,
    env:       options.mainConfig.app.env
  });

};

/*
 * Initialise the notification ready for use.
 * finish(err);
 */
SlackNotification.prototype.init = function (finish) {

  //nothing required.

  return finish(null);

};

/*
 * Send the notification.
 * finish(err);
 */
SlackNotification.prototype.notify = function (text, finish) {
  finish = finish || function(){};

  var mode = this.cfg.env.toUpperCase();

  fetch(this.cfg.url, {
    method: 'GET',
    body:   JSON.stringify({
      text:       '[' + this.cfg.appName + '] [' + mode + '] ' + text,
      username:   this.cfg.username,
      icon_emoji: this.cfg.iconEmoji,
      icon_url:   this.cfg.iconURL
    })
  })
  .then(function(res) {
    return finish(null);
  });

};

/*
 * Export!
 */
module.exports = SlackNotification;
