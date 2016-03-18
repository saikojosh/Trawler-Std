#! /usr/bin/env node

/*
 * TRAWLER (entry point).
 */

// Ensure we throw exceptions that occur within Trawler rather than swallowing them.
process.on('uncaughtException', function (err) {
  throw err;
});

var pathify     = require('path').join;
var packageJSON = require(pathify(process.cwd(), 'package.json'));
var extender    = require('object-extender');
var Trawler     = require('./Trawler');

// Prepare Trawler.
var boat = new Trawler({
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
