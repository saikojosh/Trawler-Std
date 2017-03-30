'use strict';

/*
 * NOTIFICATION: email.
 * Notifies an email address.
 */

const postmark = require('postmark');
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
			case 'postmark': this.client = new postmark.Client(this.cfg.apiKey); break;
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

			// Create and style the email body.
			const htmlBody = _text
				.replace(/\n/g, '<br>')
				.replace(/\*(.+?)\*/g, '<b>$1</b>')
				.replace(/```(.+?)```/g, '<div style="border: 1px solid #ccc; background: #eee; padding: 10px; font-family: Courier New, Courier;">$1</div>')
				.replace(/`(.+?)`/g, '<span style="background: #ffcbcb; padding: 1px 3px; margin: 0 2px; border-radius: 4px;">$1</span>');

			// Send the notification to all the notification addresses at once.
			this.client.sendEmail({
				From: this.cfg.fromEmail,
				To: this.cfg.notificationAddresses.join(','),
				Subject: `Alert from ${appName}!`,
				HtmlBody: `<div style="font-family: Verdana; font-size: 13px; line-height: 1.65;">${htmlBody}</div>`,
			}, (err, result) => {
				if (err) { return finish(err); }
				return finish(null);
			})

		});

	}

};
