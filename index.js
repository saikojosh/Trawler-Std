#! /usr/bin/env node
'use strict';

/*
 * TRAWLER (entry point).
 */

const packageJSON = require('./package.json');
const appPackageJSON = require('./modules/appPackageJSON');
const extender = require('object-extender');
const Trawler = require('./Trawler');

// Prepare Trawler.
const boat = new Trawler({
  app: {
    name: appPackageJSON.name,
    version: appPackageJSON.version,
    mainFile: appPackageJSON.main,
    env: process.env.NODE_ENV,
  },
  trawler: extender.copy(appPackageJSON.trawler) || {},  // Break the reference with the app's packageJSON object.
  cliArgs: process.argv.slice(2),
});

// Ensure we throw exceptions that occur within Trawler rather than swallowing them.
// We bind this method to 'boat' (the Trawler instance) below.
function handleUncaughtException (unhandledErr) {

  // Output the unhandled error and add a timer to force quit the app if we get stuck in an error loop.
  boat.log.error(unhandledErr.stack);
  setTimeout(process.exit.bind(null, 1), 3000);  // Prevent error loops.

  // Log the Trawler crash.
  boat.outputLog('trawler', {
    message: `Trawler (v${packageJSON.version}) itself has crashed!`,
    trawlerLogType: 'error',
  }, () => {  // Ignore any error here.

    // Attempt to notify our services.
    boat.sendNotifications({
      notificationType: 'trawler-crash',
      trawlerErr: unhandledErr,
    }, () => {  // Ignore any error here.

      // Crash Trawler with the unhandled error.
      setTimeout(process.exit.bind(null, 1), 1000);  // Slight delay to allow streams to flush.

    });

  });

}
process.on('uncaughtException', handleUncaughtException);

// Initialise Trawler instance.
boat.init((err) => {

  if (err) { throw err; }

  // Ensure we tidy up the child app when Trawler quits.
  process.on('SIGINT', () => {
    console.log('');  // Line break after the ^C in the console.
    process.exit(0);  // When ctrl-c is pressed.
  });
  process.on('exit', () => {
    boat.killApp();
  });

});
