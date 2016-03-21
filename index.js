#! /usr/bin/env node
'use strict';

/*
 * TRAWLER (entry point).
 */

const pathify = require('path').join;
const packageJSON = require(pathify(process.cwd(), 'package.json'));
const extender = require('object-extender');
const Trawler = require('./Trawler');
let boat;

// Ensure we throw exceptions that occur within Trawler rather than swallowing them.
// We bind this method to 'boat' (the Trawler instance) below.
function handleUncaughtException (unhandledErr) {

  // Log the Trawler crash.
  boat.outputLog('trawler', 'Trawler itself has crashed!', () => {  // Ignore any error here.

    // Attempt to notify our services.
    boat.sendNotifications({
      notificationType: 'trawler-crash',
      trawlerErr: unhandledErr,
    }, () => {  // Ignore any error here.

      // Crash Trawler with the unhandled error.
      console.error(unhandledErr.stack);
      process.exit(1);

    });

  });

}
process.on('uncaughtException', handleUncaughtException);

// Prepare Trawler.
boat = new Trawler({
  app: {
    name: packageJSON.name,
    version: packageJSON.version,
    mainFile: packageJSON.main,
    env: process.env.NODE_ENV,
  },
  trawler: extender.copy(packageJSON.trawler) || {},  // Break the reference with the packageJSON object.
});

// Initialise Trawler instance.
boat.init((err) => {

  if (err) { throw err; }

  // Ensure we tidy up the child app when Trawler quits.
  process.on('SIGINT', () => {
    process.exit(0);  // When ctrl-c is pressed.
  });
  process.on('exit', () => {
    boat.killApp();
  });

});
