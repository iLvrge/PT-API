'use strict';

// Layout ids and tab expansion now live in src/shared/layouts.js — they are
// used by dashboards/assets/events too. Re-exported here so the customers
// module keeps one import surface.
const { LAYOUTS, findLayout, checkTabs, TABS, ASSIGNMENT_TABS } = require('../../shared/layouts');

const RECORD_LIMIT = 1000;
const OFFSET = 0;

module.exports = { LAYOUTS, findLayout, checkTabs, TABS, ASSIGNMENT_TABS, RECORD_LIMIT, OFFSET };
