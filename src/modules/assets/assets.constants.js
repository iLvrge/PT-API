'use strict';

/**
 * CPC classification granularity.
 *
 * A CPC symbol is section + class + sub-class + main group / sub group
 * (e.g. H04L 29/06). `range` chooses how far down to aggregate, so the same
 * asset set can be grouped coarsely or finely.
 */
const CPC_RANGES = {
  5: 'section',
  4: 'CONCAT(section, class)',
  3: 'CONCAT(section, class, sub_class)',
  2: 'CONCAT(section, class, sub_class, main_group, "/00")',
  1: 'CONCAT(section, class, sub_class, main_group, "/", sub_group)',
};
const DEFAULT_CPC_RANGE = CPC_RANGES[3];

/** The expression for a range value, allowlisted — never interpolated input. */
const cpcRangeExpression = (range) => CPC_RANGES[Number(range)] || DEFAULT_CPC_RANGE;

// Assets filed before this are out of scope for the CPC breakdown.
const CPC_YEAR_FLOOR = 2000;

// Layout ids at or below this live in db_new_application.assets; above it they
// are precomputed metrics in dashboard_items.
const ASSETS_LAYOUT_CEILING = 15;

/**
 * Strip the decoration people paste around asset numbers: a US prefix, a kind
 * code suffix (A1, B2), and any punctuation.
 */
const normaliseAssetNumber = (value) => {
  let number = String(value).toLowerCase();
  if (number.includes('us')) number = number.replace('us', '');
  if (number.includes('a')) number = number.slice(0, number.indexOf('a'));
  if (number.includes('b')) number = number.slice(0, number.indexOf('b'));
  return number.replace(/[,./]/g, '').trim();
};

module.exports = {
  CPC_RANGES,
  DEFAULT_CPC_RANGE,
  cpcRangeExpression,
  CPC_YEAR_FLOOR,
  ASSETS_LAYOUT_CEILING,
  normaliseAssetNumber,
};
