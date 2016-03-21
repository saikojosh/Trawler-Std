'use strict';

/*
 * NOTIFICATION: slack.
 * Notifies a Slack channel.
 */

const fetch = require('node-fetch');
const extender = require('object-extender');

module.exports = class SlackNotification {

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
      type: 'slack',
      url: null,
      username: 'Trawler',
      iconEmoji: ':anchor:',
    }, options.itemConfig, {
      // Private config.
      appName: options.mainConfig.app.name,
      env: options.mainConfig.app.env,
      version: options.mainConfig.app.version,
    });

  }

  /*
   * Initialise the notification ready for use.
   * finish(err);
   */
  init (finish) {

    /* Nothing required. */

    return finish(null);

  }

  /*
   * Send the notification.
   * finish(err);
   */
  send (_options, _finish) {
    const finish = _finish || function () {};

    const options = extender.defaults({
      notificationType: null,
      numRestarts: null,
      childAppLastStderr: null,
      trawlerErr: null,
    }, _options);

    const appName = this.cfg.appName;
    const mode = this.cfg.env.toLowerCase();
    const version = `v${this.cfg.version}`;
    let message;

    // Prepare the appropriate message.
    switch (options.notificationType) {
      case 'app-no-restarts': message = '*Immediate attention required:* The app is now allowed to crash because "restartOnCrash" is not set to true.'; break;
      case 'app-restart-limit': message = 'The app has crashed *' + options.numRestarts + ' time(s)*!\n*Immediate attention required:* The app has crashed too many times and cannot be restarted again (max ' + options.numRestarts + ' restart(s) allowed).\n```' + options.childAppLastStderr + '```'; break;
      case 'app-crash': message = 'The app has crashed *' + options.numRestarts + ' time(s)*!\n```' + options.childAppLastStderr + '```'; break;
      case 'trawler-crash': message = '*Immediate attention required:* Trawler itself has crashed!\n```' + options.trawlerErr.stack + '```'; break;
      default: message = 'Something unexpected happened, it\'s probably worth checking out the application'; break;
    }

    const text = '*App `' + appName + '` in `' + mode + '` mode - `' + version + '`:*\n' + message;

    // Post to Slack.
    fetch(this.cfg.url, {
      method: 'POST',
      body: JSON.stringify({
        text,
        username: this.cfg.username,
        icon_emoji: this.cfg.iconEmoji,
        icon_url: this.cfg.iconURL,
      }),
    })
    .then((/* res */) => {
      return finish(null);
    })
    .catch((err) => {
      return finish(err);
    });

  }

};
