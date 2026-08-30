'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

const SEARCH_LIMIT = 1000;

/** Full-text search over counterparty names. */
const searchParties = (searchString) =>
  q.selectAll(
    connections.resources,
    `SELECT assignor_and_assignee_id as id, name FROM assignor_and_assignee
      WHERE MATCH(name) AGAINST (:searchItem)
      GROUP BY name ORDER BY name ASC LIMIT :limit`,
    { searchItem: searchString, limit: SEARCH_LIMIT }
  );

/** Full-text search over recording-party (correspondent) names. */
const searchAssignments = (searchString) =>
  q.selectAll(
    connections.resources,
    `SELECT rf_id as id, cname as name FROM assignment
      WHERE MATCH(cname) AGAINST (:searchItem)
      GROUP BY cname ORDER BY cname ASC LIMIT :limit`,
    { searchItem: searchString, limit: SEARCH_LIMIT }
  );

module.exports = { searchParties, searchAssignments, SEARCH_LIMIT };
