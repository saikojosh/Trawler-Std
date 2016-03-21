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
    env:       options.mainConfig.app.env,
    version:   options.mainConfig.app.version
  });

};

/*
 * Initialise the notification ready for use.
 * finish(err);
 */
SlackNotification.prototype.init = function (finish) {

  /* Nothing required. */

  return finish(null);

};

/*
 * Send the notification.
 * finish(err);
 */
SlackNotification.prototype.send = function (options, finish) {
  finish = finish || function(){};

  options = extender.defaults({
    notificationType: null,
    numRestarts:      null,
    trawlerErr:       null
  }, options);

  // Prepare the appropriate message.
  var message;
  switch (options.notificationType) {
    case 'app-no-restarts':   message = '*Immediate attention required:* The app is now allowed to crash because "restartOnCrash" is not set to true.';                                           break;
    case 'app-restart-limit': message = '*Immediate attention required:* The app has crashed too many times and cannot be restarted again (max ' + options.numRestarts + ' restart(s) allowed).'; break;
    case 'app-crash':         message = 'The app has crashed *' + options.numRestarts + ' time(s)*.';                                                                                             break;
    case 'trawler-crash':     message = '*Immediate attention required:* Trawler itself has crashed!\n```' + options.trawlerErr.stack + '```';                                                    break;
  }

  // Post to Slack.
  fetch(this.cfg.url, {
    method: 'POST',
    body:   JSON.stringify({
      text:       '*App `' + this.cfg.appName + '` in `' + this.cfg.env.toLowerCase() + '` mode - `v' + this.cfg.version + '`:*\n' + message,
      username:   this.cfg.username,
      icon_emoji: this.cfg.iconEmoji,
      icon_url:   this.cfg.iconURL
    })
  })
  .then(function(res) {
    return finish(null);
  })
  .catch(function (err) {
    return finish(err);
  });

};

/*
 * Export!
 */
module.exports = SlackNotification;
