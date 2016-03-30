'use strict';

/*
 * APP PACKAGE JSON
 * Loads in the package.json for the child app Trawler is running.
 */

const pathify = require('path').join;

module.exports = require(pathify(process.cwd(), 'package.json'));
