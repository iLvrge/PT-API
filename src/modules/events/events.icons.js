'use strict';

/**
 * The 25 maintenance event icons.
 *
 * These were a 1,500-line object literal at the top of the events route, a
 * separate set from the 34 flag icons in the event-icons module. They are .svg
 * files here, read once and served from that cache.
 */

const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(__dirname, 'icons');

let cache = null;

const all = () => {
  if (cache) return cache;
  cache = {};
  fs.readdirSync(ICON_DIR)
    .filter((name) => name.endsWith('.svg'))
    .forEach((name) => {
      cache[path.basename(name, '.svg')] = fs.readFileSync(path.join(ICON_DIR, name), 'utf8').trim();
    });
  return cache;
};

/** One icon's markup, or null. */
const byId = (id) => {
  if (id === null || id === undefined) return null;
  const icons = all();
  return Object.prototype.hasOwnProperty.call(icons, String(id)) ? icons[String(id)] : null;
};

/** The icon set for one maintenance code: up to three icons, keyed icon1..3. */
const forCode = (code) => {
  const icons = {};
  ['icon1', 'icon2', 'icon3'].forEach((key) => {
    const svg = byId(code && code[key]);
    if (svg !== null) icons[key] = svg;
  });
  return icons;
};

const reset = () => {
  cache = null;
};

module.exports = { all, byId, forCode, reset, ICON_DIR };
