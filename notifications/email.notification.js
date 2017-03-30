'use strict';

/*
 * NOTIFICATION: email.
 * Notifies an email address.
 */

const markdown = require('markdown').markdown;
const postmark = require('postmark');
const promisify = require('node-promisify');
const NotificationBase = require('./Notification');

module.exports = class EmailNotification extends NotificationBase {

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
			type: 'email',
			provider: null,
			apiKey: null,
			notificationAddresses: [],
			fromEmail: null,
		}, options);

		this.log.debug(`   Notification Addresses: ${JSON.stringify(this.cfg.notificationAddresses)}`);
		this.log.debug(`   Provider: ${this.cfg.provider}`);
		this.log.debug(`   From Email: ${this.cfg.fromEmail}`);

	}

	/*
	 * Initialise the notification ready for use.
	 * finish(err);
	 */
	init (finish) {

		this.log.debug(`   Initialising ${this.cfg.type} notification...`);

		switch (this.cfg.provider) {
			case 'postmark': this.client = promisify(new postmark.Client(this.cfg.apiKey)); break;
			default: return finish(new Error('Invalid email provider specified.'));
		}

		this.log.debug('   Done.');

		return finish(null);

	}

	/*
	 * Send the notification.
	 * finish(err);
	 */
	send (_options, _finish) {

		super.send(_options, _finish, (err, options, finish, appName, mode, version, _text) => {

			if (err) { return finish(err); }

			// Create the email body.
			const htmlBody = markdown.toHTML(_text);

			// Send the notification to all the addresses at once.
			this.client.sendEmail({
				From: this.cfg.fromEmail,
				To: this.cfg.notificationAddresses.join(','),
				Subject: `Alert from ${appName}!`,
				HtmlBody: htmlBody,
			})
				.then(() => finish(null))
				.catch((err) => finish(err));

		});

	}

};
