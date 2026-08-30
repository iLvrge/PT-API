'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

/**
 * Portfolio validity counters, summed across the organisation's companies.
 * One row per organisation; null when the organisation has no rows yet.
 */
const counters = (orgId, companies) => {
  const repl = { orgId };
  let sql = `SELECT SUM(application) AS application, SUM(patent) AS patent,
                    SUM(encumbered) AS encumbered,
                    SUM(current_patent_year) AS current_patent,
                    SUM(current_application_year) AS current_application,
                    SUM(difference_patent) AS difference_patent,
                    SUM(difference_application) AS difference_application
               FROM validity WHERE organisation_id = :orgId`;
  if (companies.length) {
    sql += ` AND representative_id IN (:companies)`;
    repl.companies = companies;
  }
  return q.selectOne(connections.application, `${sql} GROUP BY organisation_id`, repl);
};

module.exports = { counters };
