#! /usr/bin/env node

/*
 * TRAWLER (entry point).
 */

 var pathify     = require('path').join;
 var packageJSON = require(pathify(process.cwd(), 'package.json'));
 var extender    = require('object-extender');
 var Trawler     = require('./Trawler');
 var boat;

// Ensure we throw exceptions that occur within Trawler rather than swallowing them.
// We bind this method to 'boat' (the Trawler instance) below.
function handleUncaughtException (unhandledErr) {

  // Log the Trawler crash.
  boat.outputLog('trawler', 'Trawler itself has crashed!', function () {  // Ignore any error here.

    // Attempt to notify our services.
    boat.sendNotifications({
      notificationType: 'trawler-crash',
      trawlerErr:       unhandledErr
    }, function () {  // Ignore any error here.

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
    name:     packageJSON.name,
    version:  packageJSON.version,
    mainFile: packageJSON.main,
    env:      process.env.NODE_ENV
  },
  trawler: extender.copy(packageJSON.trawler) || {}  // Break the reference with the packageJSON object.
});

// Initialise Trawler instance.
boat.init(function (err) {

  if (err) { throw err; }

  // Ensure we tidy up the child app when Trawler quits.
  process.on('SIGINT', function () {
    process.exit(0);  //when ctrl-c is pressed.
  });
  process.on('exit', function () {
    boat.killApp();
  });

});
