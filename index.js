#! /usr/bin/env node

/*
 * TRAWLER (entry point).
 */

var packageJSON = require('./package.json');
var Trawler     = require('./Trawler');

// Prepare Trawler.
var boat = new Trawler({
  app: {
    name:     packageJSON.name,
    version:  packageJSON.version,
    mainFile: packageJSON.main,
    env:      process.env.NODE_ENV
  },
  trawler: packageJSON.trawler || {}
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
