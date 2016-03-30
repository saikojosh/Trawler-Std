'use strict';

/*
 * APP PACKAGE JSON
 * Loads in the package.json for the child app Trawler is running.
 */

const pathify = require('path').join;

try {
  module.exports = require(pathify(process.cwd(), 'package.json'));
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.log('package.json not found - are you sure this directory contains a Node application?');
    process.exit(1);
  } else {
    throw err;
  }
}
