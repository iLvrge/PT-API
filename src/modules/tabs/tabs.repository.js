'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

// Companies on a tab with customer counts (db_application.tree_parties).
const companiesOnTab = (representativeIds, orgId, tabId) =>
  q.selectAll(
    connections.application,
    `SELECT representative_id AS id, representative_name AS name,
            COUNT(assignor_and_assignee_id) AS totalCustomers
       FROM tree_parties
      WHERE representative_id IN (:representativeIds) AND organisation_id = :orgId AND tab_id = :tabId
      GROUP BY organisation_id, representative_id
      ORDER BY representative_name ASC`,
    { representativeIds, orgId, tabId }
  );

// Total documentid rows per company over that tab's rf_ids — one grouped query
// replacing the legacy per-company loop (same counters).
const assetTotalsByCompany = (representativeIds, orgId, tabId) =>
  q.selectAll(
    connections.application,
    `SELECT x.representative_id, COUNT(*) AS totalAssets
       FROM documentid AS d
       INNER JOIN (SELECT DISTINCT rf_id, representative_id FROM tree_parties_collection
                    WHERE representative_id IN (:representativeIds) AND tab_id = :tabId
                      AND organisation_id = :orgId) AS x ON x.rf_id = d.rf_id
      GROUP BY x.representative_id`,
    { representativeIds, orgId, tabId }
  );

// Customers under one company on a tab (grouped sums, optional paging).
const companyCustomers = ({ representativeId, orgId, tabId, limit, offset }) => {
  let sql = `SELECT assignor_and_assignee_id AS id, name,
      SUM(transaction_count) AS totalTransactions, SUM(assets_count) AS totalAssets
    FROM tree_parties
    WHERE representative_id = :representativeId AND organisation_id = :orgId AND tab_id = :tabId
    GROUP BY organisation_id, representative_id, tab_id
    ORDER BY name ASC`;
  const repl = { representativeId, orgId, tabId };
  if (limit !== undefined) {
    sql += ` LIMIT :limit OFFSET :offset`;
    repl.limit = limit;
    repl.offset = offset;
  }
  return q.selectAll(connections.application, sql, repl);
};

// Customer rows grouped by name across companies (paged).
const customersByName = ({ companies, orgId, tabId, limit, offset }) => {
  let sql = `SELECT assignor_and_assignee_id AS customer_id, representative_id AS company_id, name,
      transaction_count AS transactionCount, assets_count AS assetsCount
    FROM tree_parties
    WHERE representative_id IN (:companies) AND tab_id = :tabId AND organisation_id = :orgId
    GROUP BY organisation_id, tab_id, name`;
  const repl = { companies, orgId, tabId };
  if (limit !== undefined) {
    sql += ` LIMIT :limit OFFSET :offset`;
    repl.limit = limit;
    repl.offset = offset;
  }
  return q.selectAll(connections.application, sql, repl);
};

const idsForName = (name, companies, orgId, tabId) =>
  q.selectAll(
    connections.application,
    `SELECT DISTINCT assignor_and_assignee_id FROM tree_parties
      WHERE name = :name AND representative_id IN (:companies) AND tab_id = :tabId AND organisation_id = :orgId`,
    { name, companies, orgId, tabId }
  );

const transactionCountForIds = (companies, orgId, tabId, assignorIds) =>
  q.selectValue(
    connections.application,
    `SELECT COUNT(*) AS transactionCount FROM (
       SELECT rf_id FROM tree_parties_collection
        WHERE organisation_id = :orgId AND representative_id IN (:companies)
          AND tab_id = :tabId AND assignor_and_assignee_id IN (:assignorIds)
        GROUP BY rf_id) AS temp`,
    { companies, orgId, tabId, assignorIds },
    'transactionCount',
    0
  );

// Normalised name/representative expansion for a customer (db_uspto).
const customerNames = (customerId) =>
  q.selectAll(
    connections.resources,
    `SELECT aaa.name, r.representative_id, r.representative_name
       FROM assignor_and_assignee AS aaa
       LEFT JOIN representative AS r ON r.representative_id = aaa.representative_id
      WHERE aaa.assignor_and_assignee_id = :customerId
      GROUP BY aaa.name`,
    { customerId }
  );

const customerIdsFor = ({ names, representativeIds }) => {
  let sql;
  const repl = {};
  if (representativeIds.length) {
    sql = `SELECT assignor_and_assignee_id FROM assignor_and_assignee
            WHERE representative_id IN (:representativeIds) OR name IN (:names)
            GROUP BY assignor_and_assignee_id`;
    repl.representativeIds = representativeIds;
    repl.names = names;
  } else {
    sql = `SELECT assignor_and_assignee_id FROM assignor_and_assignee
            WHERE name IN (:names) GROUP BY assignor_and_assignee_id`;
    repl.names = names;
  }
  return q.selectAll(connections.resources, sql, repl);
};

const customerTransactions = ({ orgId, representativeIds, customerIds, tabId, limit, offset }) => {
  let sql = `SELECT rf_id AS id, exec_dt, assets_count AS totalAssets
    FROM tree_parties_collection
    WHERE organisation_id = :orgId AND representative_id IN (:representativeIds)
      AND assignor_and_assignee_id IN (:customerIds) AND tab_id = :tabId
    GROUP BY rf_id ORDER BY exec_dt DESC`;
  const repl = { orgId, representativeIds, customerIds, tabId };
  if (limit !== undefined) {
    sql += ` LIMIT :limit OFFSET :offset`;
    repl.limit = limit;
    repl.offset = offset;
  }
  return q.selectAll(connections.application, sql, repl);
};

const transactionAssets = ({ rfId, limit, offset }) => {
  let sql = `SELECT appno_doc_num AS application, grant_doc_num AS patent FROM documentid WHERE rf_id = :rfId`;
  const repl = { rfId };
  if (limit !== undefined) {
    sql += ` LIMIT :limit OFFSET :offset`;
    repl.limit = limit;
    repl.offset = offset;
  }
  return q.selectAll(connections.application, sql, repl);
};

module.exports = {
  companiesOnTab,
  assetTotalsByCompany,
  companyCustomers,
  customersByName,
  idsForName,
  transactionCountForIds,
  customerNames,
  customerIdsFor,
  customerTransactions,
  transactionAssets,
};
