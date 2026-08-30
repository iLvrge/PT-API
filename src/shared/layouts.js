'use strict';

/**
 * Layout ids and tab expansion — shared by every module that accepts a
 * `layout` or `tabs` parameter (customers, dashboards, assets, events...).
 *
 * Ported from the legacy helpers.findLayout / helpers.checkTabs, which lived in
 * one 4k-line helpers/helper.js required by every route file.
 */

// Layout name -> id (default 15 for anything unknown, as in the legacy helper).
const LAYOUTS = {
  restore_ownership: 1,
  clear_encumbrances: 18,
  incorrect_address: 19,
  incorrect_names: 17,
  to_be_monitized: 20,
  unnecessary_patents: 21,
  missed_monetization: 22,
  late_maintainance: 23,
  incorrect_recording: 24,
  late_recording: 25,
  deflated_collaterals: 26,
  unpaid_due: 27,
  assigned: 30,
  filled: 31,
  acquired: 32,
  divested: 33,
  collaterlized: 34,
  maintenance_budget: 35,
  pay_maintainence_fee: 35,
  abandoned: 36,
  ptab: 37,
  top_non_us_members: 38,
  proliferate_inventors: 39,
  top_law_firms: 40,
  top_lenders: 41,
  uncollateralized: 45,
};

const findLayout = (layout) =>
  (Object.prototype.hasOwnProperty.call(LAYOUTS, layout) ? LAYOUTS[layout] : 15);

const TABS = [0, 1, 2, 3, 4, 11, 5, 6, 7, 8, 9, 10];
const ASSIGNMENT_TABS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

// Expand shorthand tab ids into their member tabs.
// 81 -> lending cluster (5,11,12,13,16); 17 -> acquisitions cluster (1,6).
const checkTabs = (tabs) => {
  const out = [...tabs];
  const lending = [5, 11, 12, 13, 16];
  if (out.includes(81) && !lending.some((t) => out.includes(t))) {
    out.push(...lending);
  } else if (out.includes(17)) {
    out.push(1, 6);
  }
  return out;
};

module.exports = { LAYOUTS, findLayout, checkTabs, TABS, ASSIGNMENT_TABS };
