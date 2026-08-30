'use strict';

const repository = require('./validity.repository');

// The shape the dashboard expects when an organisation has no validity rows.
const EMPTY = {
  application: 0,
  patent: 0,
  encumbered: 0,
  current_patent: 0,
  current_application: 0,
  difference_patent: 0,
  difference_application: 0,
};

const counters = async (orgId, companies) => {
  const row = await repository.counters(orgId, companies);
  return row || { ...EMPTY };
};

module.exports = { counters, EMPTY };
