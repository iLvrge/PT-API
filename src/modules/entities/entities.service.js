'use strict';

const repository = require('./entities.repository');

const PARTIES = 1;
const ASSIGNMENTS = 2;

/** Entity search. Type 1 = counterparties, type 2 = recorded assignments. */
const search = (searchString, type) => {
  if (type === PARTIES) return repository.searchParties(searchString);
  if (type === ASSIGNMENTS) return repository.searchAssignments(searchString);
  return Promise.resolve([]);
};

module.exports = { search, PARTIES, ASSIGNMENTS };
