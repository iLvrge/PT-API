'use strict';

/**
 * The few date operations the illustration payload needs, in local time —
 * matching what moment() did in the legacy code, without the dependency.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Format as YYYY-MM-DD in local time. Mirrors moment().format('YYYY-MM-DD'). */
const ymd = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** A new Date `days` earlier. Mirrors moment().subtract(days, 'days'). */
const minusDays = (value, days) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return date;
  date.setDate(date.getDate() - days);
  return date;
};

module.exports = { ymd, minusDays };
