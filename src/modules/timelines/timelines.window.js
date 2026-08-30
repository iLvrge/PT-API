'use strict';

/**
 * Picks the widest date window around the caller's range that still holds a
 * drawable number of points.
 *
 * The legacy version lived inline in two route handlers and used `return false`
 * inside its widening loop — which returned from the *handler*, not the loop,
 * so a busy organisation's request simply never sent a response and the socket
 * hung until it timed out. It also leaked `i` and `customAllQuery` as globals.
 *
 * The search is expressed here as a plain sequence of candidate windows so it
 * can be unit-tested against a stub counter.
 */

const { ymd, plusMonths, minusMonths } = require('../../utils/dates');
const { WINDOW_ROW_LIMIT } = require('./timelines.constants');

const window = (start, end) => ({ startDate: ymd(start), endDate: ymd(end) });

/**
 * Every window to try, widest first.
 * @param {string} from caller's start date
 * @param {string} to caller's end date
 * @param {boolean} scrollRight widen towards later dates rather than earlier
 */
const candidates = (from, to, scrollRight) => {
  const list = [window(minusMonths(from, 12), plusMonths(to, 12))];
  list.push(window(minusMonths(from, 6), plusMonths(to, 6)));

  // Still too dense: hold one edge and walk the other in one-month steps.
  if (scrollRight) {
    const fixedEnd = plusMonths(to, 18);
    for (let i = 1; i < 24; i++) list.push(window(minusMonths(from, i), fixedEnd));
  } else {
    const fixedStart = minusMonths(from, -6);
    for (let i = 1; i < 24; i++) list.push(window(fixedStart, minusMonths(to, i)));
  }
  return list;
};

/**
 * @param {object} input
 * @param {string} input.from
 * @param {string} input.to
 * @param {boolean} input.scrollRight
 * @param {(w: {startDate: string, endDate: string}) => Promise<number>} input.count
 * @returns {Promise<{startDate: string, endDate: string}|null>} the first
 *   window holding between 1 and WINDOW_ROW_LIMIT rows, or null.
 */
const find = async ({ from, to, scrollRight, count, limit = WINDOW_ROW_LIMIT }) => {
  const windows = candidates(from, to, scrollRight);

  for (let i = 0; i < windows.length; i++) {
    const rows = await count(windows[i]);
    if (rows > 0 && rows <= limit) return windows[i];
    // An empty result on either of the two opening windows means the range
    // genuinely holds nothing, so there is no point walking the edges. Inside
    // the walk itself an empty step is just a gap, and the search continues.
    if (rows === 0 && i < 2) return null;
  }
  return null;
};

module.exports = { find, candidates };
