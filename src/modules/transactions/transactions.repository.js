'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

const SUMMED = [
  'buy', 'buy_patent', 'diff_buy_patent',
  'sale', 'sale_patent', 'diff_sale_patent',
  'security', 'security_patent', 'diff_security_patent',
  'release', 'release_patent', 'diff_release_patent',
  'license_in', 'license_in_patent', 'diff_license_in_patent',
  'license_out', 'license_out_patent', 'diff_license_out_patent',
];

/** Transaction counters for an organisation, optionally scoped to companies. */
const counters = (orgId, companies) => {
  const repl = { orgId };
  // Column names come from the constant above, never from the request.
  const sums = SUMMED.map((column) => `SUM(${column}) AS ${column}`).join(', ');
  let sql = `SELECT ${sums} FROM transactions WHERE organisation_id = :orgId`;
  if (companies.length) {
    sql += ` AND representative_id IN (:companies)`;
    repl.companies = companies;
  }
  return q.selectOne(connections.application, `${sql} GROUP BY organisation_id`, repl);
};

/**
 * The parties on one recorded transaction. The legacy route issued four
 * Sequelize `include` trees per request; these are four flat reads with the
 * representative name resolved in the same statement.
 */
const assignees = (rfId) =>
  q.selectAll(
    connections.resources,
    `SELECT ass.ee_name AS name, ass.assignor_and_assignee_id,
            aaa.name AS party_name, aaa.representative_id AS id,
            r.representative_name AS representative_name
       FROM assignee AS ass
       LEFT JOIN assignor_and_assignee AS aaa
              ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id
       LEFT JOIN representative AS r ON r.representative_id = aaa.representative_id
      WHERE ass.rf_id = :rfId
      GROUP BY ass.assignor_and_assignee_id, ass.rf_id`,
    { rfId }
  );

const assignors = (rfId) =>
  q.selectAll(
    connections.resources,
    `SELECT aor.or_name AS name, aor.assignor_and_assignee_id,
            aaa.name AS party_name, aaa.representative_id AS id,
            r.representative_name AS representative_name
       FROM assignor AS aor
       LEFT JOIN assignor_and_assignee AS aaa
              ON aaa.assignor_and_assignee_id = aor.assignor_and_assignee_id
       LEFT JOIN representative AS r ON r.representative_id = aaa.representative_id
      WHERE aor.rf_id = :rfId
      GROUP BY aor.assignor_and_assignee_id, aor.rf_id`,
    { rfId }
  );

const assignment = (rfId) =>
  q.selectOne(
    connections.resources,
    `SELECT cname AS name, caddress_1, caddress_2, rf_id AS id
       FROM assignment WHERE rf_id = :rfId LIMIT 1`,
    { rfId }
  );

const assets = (rfId) =>
  q.selectAll(
    connections.resources,
    `SELECT appno_doc_num AS application, grant_doc_num AS patent
       FROM documentid WHERE rf_id = :rfId GROUP BY appno_doc_num, grant_doc_num`,
    { rfId }
  );

module.exports = { counters, assignees, assignors, assignment, assets, SUMMED };
