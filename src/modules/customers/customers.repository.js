'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

// Tenant: top-level company representative ids (helpers.getCompaniesList, type 0).
const companyRepresentativeIds = async (tenant) => {
  const rows = await q.selectAll(tenant, `SELECT representative_id FROM representative WHERE type = 0`);
  return rows.map((r) => r.representative_id);
};

// db_application.tree_parties: per-tab customer counts.
const assetTypeTabs = (companies, organisationId) => {
  if (!companies.length) return Promise.resolve([]);
  return q.selectAll(
    connections.application,
    `SELECT tab_id, COUNT(DISTINCT name) AS customer_count
       FROM tree_parties
      WHERE representative_id IN (:companies) AND organisation_id = :organisationId
      GROUP BY tab_id`,
    { companies, organisationId }
  );
};

// db_application.tree_parties: distinct-name count for a set of tabs.
const assetTypeCompaniesCount = (companies, tabs, organisationId) => {
  if (!companies.length) return Promise.resolve(0);
  return q.selectValue(
    connections.application,
    `SELECT COUNT(DISTINCT name) AS total FROM tree_parties
      WHERE representative_id IN (:companies) AND organisation_id = :organisationId AND tab_id IN (:tabs)`,
    { companies, organisationId, tabs },
    'total',
    0
  );
};

const assetTypeCompanies = (companies, tabs, organisationId, limit, offset) => {
  if (!companies.length) return Promise.resolve([]);
  return q.selectAll(
    connections.application,
    `SELECT assignor_and_assignee_id AS id, name, SUM(transaction_count) AS totalTransactions
       FROM tree_parties
      WHERE representative_id IN (:companies) AND organisation_id = :organisationId AND tab_id IN (:tabs)
      GROUP BY name
      ORDER BY name ASC
      LIMIT :limit OFFSET :offset`,
    { companies, organisationId, tabs, limit, offset }
  );
};

/**
 * Companies for a single tab. Cross-database, cross-charset:
 * db_new_application.assets.appno_doc_num is utf8mb4 while
 * db_uspto.documentid.appno_doc_num is latin1. Per COLLATION.md the CONVERT goes
 * on the small, filtered `assets` side (ASCII-safe keys) so db_uspto.documentid
 * keeps its latin1 index instead of being scanned. VERIFY with EXPLAIN — see the
 * commands in the module's notes.
 */
const assetTypeTabCompanies = (company, tabId, layout, organisationId) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT apt.assignor_and_assignee_id AS id,
            IF(representative.representative_name <> '', representative.representative_name, aaa.name) AS entityName
       FROM activity_parties_transactions AS apt
       INNER JOIN db_uspto.assignor_and_assignee AS aaa
               ON aaa.assignor_and_assignee_id = apt.assignor_and_assignee_id
       LEFT JOIN db_uspto.representative AS representative
              ON representative.representative_id = aaa.representative_id
      WHERE apt.company_id = :company
        AND (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)
        AND apt.rf_id IN (
          SELECT documentid.rf_id
            FROM db_new_application.assets AS assets
            INNER JOIN db_uspto.documentid AS documentid
                    ON documentid.appno_doc_num = CONVERT(assets.appno_doc_num USING latin1)
                   AND documentid.grant_doc_num = CONVERT(assets.grant_doc_num USING latin1)
           WHERE assets.layout_id = :layout
             AND assets.company_id = :company
             AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)
           GROUP BY documentid.rf_id
        )
        AND apt.activity_id = :tabId
      GROUP BY entityName`,
    { company, tabId, layout, organisationId }
  );

/**
 * Assignments (reels/frames) for the selected companies/tabs/customers.
 * Same cross-charset assets<->documentid join; CONVERT stays on the small
 * utf8mb4 assets side until those columns are converted to latin1 (then the
 * CONVERT wrappers can be dropped for a native join).
 */
const assetTypeAssignments = ({ companies, tabs, customers, layout, organisationId }) => {
  const hasCompanies = Array.isArray(companies) && companies.length > 0;
  let sql = `
    SELECT apt.rf_id,
           date_format(apt.exec_dt, '%m-%d-%y') AS date,
           (SELECT COUNT(DISTINCT assets1.appno_doc_num)
              FROM assets AS assets1
              INNER JOIN db_uspto.documentid AS documentid_1
                      ON documentid_1.appno_doc_num = CONVERT(assets1.appno_doc_num USING latin1)
                     AND documentid_1.grant_doc_num = CONVERT(assets1.grant_doc_num USING latin1)
             WHERE documentid_1.rf_id = apt.rf_id) AS assets
      FROM activity_parties_transactions AS apt
     WHERE (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)`;
  if (hasCompanies) sql += ` AND apt.company_id IN (:companies)`;
  sql += `
       AND apt.rf_id IN (
         SELECT documentid.rf_id
           FROM db_new_application.assets AS assets
           INNER JOIN db_uspto.documentid AS documentid
                   ON documentid.appno_doc_num = CONVERT(assets.appno_doc_num USING latin1)
                  AND documentid.grant_doc_num = CONVERT(assets.grant_doc_num USING latin1)
          WHERE assets.layout_id = :layout`;
  if (hasCompanies) sql += ` AND apt.company_id IN (:companies)`;
  sql += `
            AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)
          GROUP BY documentid.rf_id)
       AND apt.activity_id IN (:tabs)
       AND apt.assignor_and_assignee_id IN (:customers)
     GROUP BY apt.rf_id`;

  return q.selectAll(connections.applicationNew, sql, {
    companies,
    tabs,
    customers,
    layout,
    organisationId,
  });
};

// Assets recorded on one reel/frame (rf_id) for a layout.
const assignmentAssets = (rfId, layout, organisationId) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT CASE WHEN assets.grant_doc_num = '' THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset,
            CASE WHEN assets.grant_doc_num = '' THEN 1 ELSE 0 END AS asset_type,
            assets.appno_doc_num, assets.grant_doc_num, 0 AS child_count, '' AS channel
       FROM db_new_application.assets AS assets
       INNER JOIN db_uspto.documentid AS documentid
               ON documentid.appno_doc_num = CONVERT(assets.appno_doc_num USING latin1)
              AND documentid.grant_doc_num = CONVERT(assets.grant_doc_num USING latin1)
      WHERE assets.layout_id = :layout
        AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)
        AND documentid.rf_id = :rfId
      GROUP BY asset`,
    { rfId, layout, organisationId }
  );

/**
 * Distinct assets from db_application.tree_parties_collection -> documentid.
 * Entirely inside db_application (all latin1) - no charset handling needed.
 */
const buildTreePartiesWhere = ({ tabs, customers, assignments }) => {
  let where = ' representative_id IN (:companies) AND organisation_id = :organisationId';
  if (tabs.length) where += ' AND tab_id IN (:tabs)';
  if (customers.length) where += ' AND assignor_and_assignee_id IN (:customers)';
  if (assignments.length) where += ' AND rf_id IN (:assignments)';
  return where;
};

const ASSET_LIST_SQL = `SELECT appno_doc_num, grant_doc_num,
  CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL THEN FORMAT(appno_doc_num,0) ELSE FORMAT(grant_doc_num,0) END AS format_asset,
  CASE WHEN grant_doc_num = '' THEN appno_doc_num ELSE grant_doc_num END AS asset,
  0 AS child_count
  FROM documentid
  WHERE rf_id IN (SELECT rf_id FROM tree_parties_collection WHERE REPLACE_WHERE)
  GROUP BY appno_doc_num, grant_doc_num`;

const assetTypeAssetsCount = (filters, replacements) => {
  const sql = `SELECT COUNT(*) AS counter FROM (${ASSET_LIST_SQL.replace('REPLACE_WHERE', buildTreePartiesWhere(filters))}) AS temp`;
  return q.selectValue(connections.application, sql, replacements, 'counter', 0);
};

const assetTypeAssets = (filters, replacements, limit, offset) => {
  const sql = `${ASSET_LIST_SQL.replace('REPLACE_WHERE', buildTreePartiesWhere(filters))}
    ORDER BY length(asset) ASC, asset ASC LIMIT :offset, :limit`;
  return q.selectAll(connections.application, sql, { ...replacements, limit, offset });
};

// ---- lawfirm / lenders (db_new_application dashboard_items + db_uspto) ----

// Law firms grouped from dashboard_items (type 40). bankMode adds the mode filter.
const lawfirmGroups = ({ companies, organisationId, bankMode }) => {
  let sql = `SELECT rf_id AS id, lawfirm, COUNT(rf_id) AS distance, GROUP_CONCAT(rf_id) AS grp
    FROM db_new_application.dashboard_items
    WHERE organisation_id = :organisationId AND type = 40 ${bankMode ? 'AND mode IN (:mode)' : ''}`;
  if (companies.length) sql += ` AND representative_id IN (:companies)`;
  sql += ` GROUP BY lawfirm`;
  const repl = { organisationId };
  if (bankMode) repl.mode = 1;
  if (companies.length) repl.companies = companies;
  return q.selectAll(connections.applicationNew, sql, repl);
};

// The law firm recorded on one rf_id (correspondent -> law_firm -> representative_law_firm).
const lawfirmForRfId = (rfId) =>
  q.selectOne(
    connections.applicationNew,
    `SELECT c.cname, lf.name, rlf.representative_id, rlf.representative_name
       FROM db_uspto.correspondent AS c
       LEFT JOIN db_uspto.law_firm AS lf ON c.cname = lf.name
       LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id
      WHERE c.rf_id = :rfId LIMIT 1`,
    { rfId }
  );

// Correspondents on the companies' transactions matching a firm (by rep id or name).
const lawfirmCorrespondents = ({ companies, organisationId, representativeId, cname }) => {
  let sql = `SELECT c.rf_id AS id, c.cname AS lawfirm, GROUP_CONCAT(rf_id) AS grp
    FROM db_uspto.correspondent AS c
    LEFT JOIN db_uspto.law_firm AS lf ON c.cname = lf.name
    LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id
    WHERE c.rf_id IN (
      SELECT rf_id FROM db_new_application.activity_parties_transactions
       WHERE (organisation_id = :organisationId OR organisation_id IS NULL)
         AND company_id IN (:companies))`;
  const repl = { companies, organisationId };
  if (representativeId) {
    sql += ` AND rlf.representative_id = :representativeId`;
    repl.representativeId = representativeId;
  } else {
    sql += ` AND c.cname = :cname`;
    repl.cname = cname;
  }
  sql += ` GROUP BY c.cname`;
  return q.selectAll(connections.applicationNew, sql, repl);
};

// Lenders: dashboard_items (type 41) joined to assignor/representative names.
const lenders = ({ companies, organisationId, bankMode }) => {
  let sql = `SELECT IF(r.representative_name <> '', r.representative_name, aaa.name) AS name,
                    assignor_id AS id, COUNT(rf_id) AS counter
    FROM db_new_application.dashboard_items AS di
    INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = di.assignor_id
    LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id
    WHERE organisation_id = :organisationId AND type = 41 ${bankMode ? 'AND mode IN (:mode)' : ''}`;
  if (companies.length) sql += ` AND di.representative_id IN (:companies)`;
  sql += ` GROUP BY name`;
  const repl = { organisationId };
  if (bankMode) repl.mode = 1;
  if (companies.length) repl.companies = companies;
  return q.selectAll(connections.applicationNew, sql, repl);
};

// ---- portfolios (db_application tree_parties family, all latin1-local) ----

const portfolioParties = ({ representativeIds, organisationId, tabId, limit, offset }) =>
  q.selectAll(
    connections.application,
    `SELECT assignor_and_assignee_id AS id, name
       FROM tree_parties
      WHERE representative_id IN (:representativeIds) AND organisation_id = :organisationId AND tab_id = :tabId
      ORDER BY name ASC LIMIT :limit OFFSET :offset`,
    { representativeIds, organisationId, tabId, limit, offset }
  );

const portfolioCollections = ({ partyIds, representativeIds, organisationId, tabId }) => {
  if (!partyIds.length) return Promise.resolve([]);
  return q.selectAll(
    connections.application,
    `SELECT assignor_and_assignee_id, rf_id, exec_dt
       FROM tree_parties_collection
      WHERE assignor_and_assignee_id IN (:partyIds)
        AND tab_id = :tabId AND representative_id IN (:representativeIds) AND organisation_id = :organisationId
      GROUP BY assignor_and_assignee_id, rf_id`,
    { partyIds, representativeIds, organisationId, tabId }
  );
};

const assetsForRfIds = (rfIds) => {
  if (!rfIds.length) return Promise.resolve([]);
  return q.selectAll(
    connections.application,
    `SELECT rf_id, appno_doc_num AS application, grant_doc_num AS patent
       FROM documentid WHERE rf_id IN (:rfIds)`,
    { rfIds }
  );
};

const portfolioRepresentativeTabs = (representativeIds, organisationId) =>
  q.selectAll(
    connections.application,
    `SELECT representative_id, representative_name, tab_id
       FROM tree_parties
      WHERE representative_id IN (:representativeIds) AND organisation_id = :organisationId
      GROUP BY organisation_id, representative_id, tab_id
      ORDER BY tab_id ASC, representative_name ASC`,
    { representativeIds, organisationId }
  );

// Per-tab customer counts restricted to a tab set (portfolios variant).
const tabCustomerCounts = (representativeIds, organisationId, tabs) =>
  q.selectAll(
    connections.application,
    `SELECT tab_id, COUNT(DISTINCT name) AS customer_count
       FROM tree_parties
      WHERE representative_id IN (:representativeIds) AND organisation_id = :organisationId AND tab_id IN (:tabs)
      GROUP BY tab_id`,
    { representativeIds, organisationId, tabs }
  );

module.exports = {
  companyRepresentativeIds,
  assetTypeTabs,
  assetTypeCompaniesCount,
  assetTypeCompanies,
  assetTypeTabCompanies,
  assetTypeAssignments,
  assignmentAssets,
  assetTypeAssetsCount,
  assetTypeAssets,
  lawfirmGroups,
  lawfirmForRfId,
  lawfirmCorrespondents,
  lenders,
  portfolioParties,
  portfolioCollections,
  assetsForRfIds,
  portfolioRepresentativeTabs,
  tabCustomerCounts,
};
