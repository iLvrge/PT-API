'use strict';

// Layout name -> id (transcribed from helpers.findLayout; default 15).
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

const findLayout = (layout) => (Object.prototype.hasOwnProperty.call(LAYOUTS, layout) ? LAYOUTS[layout] : 15);

const TABS = [0, 1, 2, 3, 4, 11, 5, 6, 7, 8, 9, 10];
const RECORD_LIMIT = 1000;
const OFFSET = 0;

module.exports = { LAYOUTS, findLayout, TABS, RECORD_LIMIT, OFFSET };
