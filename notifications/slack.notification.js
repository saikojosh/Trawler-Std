'use strict';

/*
 * NOTIFICATION: slack.
 * Notifies a Slack channel.
 */

const fetch = require('node-fetch');
const NotificationBase = require('./Notification');

module.exports = class SlackNotification extends NotificationBase {

  /*
   * Setup the provider.
   * [options]
   *  mainConfig - The main Trawler config.
   *  itemConfig - The config for the notification.
   *  internalStream - Trawler's internal stream.
   */
  constructor (options) {

    super({
      // Default values.
      type: 'slack',
      url: null,
      username: 'Trawler',
      iconEmoji: ':anchor:',
    }, options);

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

    super.send(_options, _finish, (err, options, finish, appName, mode, version, text) => {

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

    });

  }

};
