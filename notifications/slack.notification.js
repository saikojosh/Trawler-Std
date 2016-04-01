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
      attention: [],
    }, options);

    this.log.debug(`   URL: ${this.cfg.url}`);
    this.log.debug(`   Username: ${this.cfg.username}`);
    this.log.debug(`   Icon Emoji: ${this.cfg.iconEmoji}`);

  }

  /*
   * Initialise the notification ready for use.
   * finish(err);
   */
  init (finish) {

    this.log.debug(`   Initialising ${this.cfg.type} notification...`);

    /* Nothing required. */

    this.log.debug('   Done.');

    return finish(null);

  }

  /*
   * Send the notification.
   * finish(err);
   */
  send (_options, _finish) {

    super.send(_options, _finish, (err, options, finish, appName, mode, version, _text) => {

      let attention = (Array.isArray(this.cfg.attention) ? this.cfg.attention : (typeof this.cfg.attention === 'string' ? [this.cfg.attention] : null));
      let text = _text;

      if (attention && attention.length) {

        // Ensure each attention string is actually a Slack username.
        for (let a = 0, alen = attention.length; a < alen; a++) {
          if (attention[a][0] === '@') { continue; }
          attention[a] = `@${attention[a]}`;
        }

        // Append the list of usernames to the message text.
        text += `\n${attention.join(', ')}\n`;

      }

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
