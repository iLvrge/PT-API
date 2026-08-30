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

/** A new Date `days` later. */
const plusDays = (value, days) => minusDays(value, -days);

/**
 * Shift by whole months. Mirrors moment().add/subtract(n, 'months'), including
 * its clamping: 31 Jan minus one month is 28/29 Feb, not 3 March.
 */
const shiftMonths = (value, months) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return date;
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
};

const plusMonths = (value, months) => shiftMonths(value, months);
const minusMonths = (value, months) => shiftMonths(value, -months);

module.exports = { ymd, minusDays, plusDays, shiftMonths, plusMonths, minusMonths };
