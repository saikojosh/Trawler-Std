'use strict';

/*
 * LOGGER
 * Handles logging information to the console.
 */

const clc = require('cli-color');

module.exports = class Logger {

  /*
   * Setup the logger.
   */
  constructor (debug) {
    this.cfg = {
      debug,
    };
  }

  /*
   * Log out as ordinary text.
   */
  message () {
    console.log.apply(console, arguments);  // Node doesn't support the spread operator without the harmony flag yet.
  }

  /*
   * Log out as important text.
   */
  title () {
    this.logAsColour('yellowBright', ['bold', 'underline'], 'log', arguments);
  }

  /*
   * Log out as important text.
   */
  important () {
    this.logAsColour('yellowBright', null, 'log', arguments);
  }

  /*
   * Log out as successful text.
   */
  success () {
    this.logAsColour('greenBright', null, 'log', arguments);
  }


  /*
   * Log out as warning text.
   */
  warning () {
    this.logAsColour('xterm:202', null, 'log', arguments);
  }

  /*
   * Logs out an error.
   */
  error () {
    this.logAsColour('redBright', null, 'error', arguments);
  }

  /*
   * Logs out a debug message (only in debug mode).
   */
  debug () {
    if (this.cfg.debug) { this.logAsColour('blueBright', 'italic', 'info', arguments); }
  }

  /*
   * Allows us to log to the console in any colour we want.
   */
  logAsColour (colour, _styles, method, _arguments) {
    const styles = (typeof _styles === 'string' ? [_styles] : _styles) || [];
    const args = Array.prototype.slice.call(_arguments);
    const colourMatch = colour.match(/^([a-z]+)(?::(\d+))?$/i);
    const colourFn = (colourMatch[2] === 'xterm' ? clc.xterm(colourMatch[2]) : clc[colourMatch[1]]);
    const output = [];

    args.forEach((arg) => {

      // Add the colour.
      let str = colourFn(arg);

      // Add the styles in turn.
      for (let s = 0, slen = styles.length; s < slen; s++) {
        const styleMethodName = styles[s];

        str = clc[styleMethodName](str);
      }

      output.push(str);
    });

    console[method].apply(console, output);  // Node doesn't support the spread operator without the harmony flag yet.
  }

};
