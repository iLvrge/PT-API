'use strict';

/**
 * Event flag icons, keyed by event id.
 *
 * The legacy route carried all 34 SVGs as template literals inside the handler
 * — 5,700 lines of markup in a route file, re-serialised on every request.
 * They now live as .svg files beside this module, are read once, and are served
 * from that cache. Editing an icon means editing an SVG, not a route.
 */

const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(__dirname, 'icons');

let cache = null;

const load = () => {
  const icons = {};
  fs.readdirSync(ICON_DIR)
    .filter((name) => name.endsWith('.svg'))
    .forEach((name) => {
      icons[path.basename(name, '.svg')] = fs.readFileSync(path.join(ICON_DIR, name), 'utf8').trim();
    });
  return icons;
};

/** Every icon, as { eventId: svgMarkup }. Read from disk once per process. */
const all = () => {
  if (!cache) cache = load();
  return cache;
};

/** One icon's markup, or null when the event has none. */
const byId = (id) => {
  const icons = all();
  return Object.prototype.hasOwnProperty.call(icons, String(id)) ? icons[String(id)] : null;
};

// Exposed for tests that need a cold read.
const reset = () => {
  cache = null;
};

module.exports = { all, byId, reset, ICON_DIR };
