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

// ---- transactions utilities ----

// Transactions for a set of reel/frames with a running asset total (db_uspto CTE).
const transactionsByGroupIds = (rfIds) =>
  q.selectAll(
    connections.applicationNew,
    `WITH trans AS (
       SELECT assignment.cname, assignment.caddress_1, assignor.rf_id, assignor.exec_dt AS \`date\`,
              (SELECT COUNT(DISTINCT documentid.appno_doc_num) FROM db_uspto.documentid AS documentid
                WHERE documentid.rf_id = assignor.rf_id) AS \`assets\`
         FROM db_uspto.assignor AS assignor
         INNER JOIN db_uspto.assignment AS assignment ON assignment.rf_id = assignor.rf_id
        WHERE assignor.rf_id IN (:rfIds)
        GROUP BY assignor.rf_id)
     SELECT rf_id, IF(cname != '', cname, caddress_1) AS name, \`date\`, \`assets\`,
            SUM(\`assets\`) OVER (ORDER BY rf_id) AS grand_total
       FROM trans`,
    { rfIds }
  );

/**
 * Stored-procedure calls. The procedures take comma-separated id strings by
 * contract (unlike the IN-clause bug elsewhere), so the CSV join is deliberate.
 * The first result set is returned, mirroring the legacy .spread handling.
 */
const callProcedure = async (sql, replacements) => {
  const raw = await q.selectAll(connections.applicationNew, sql, replacements);
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first ? Object.values(first) : [];
};

const correctAddress = ({ companiesCsv, organisationId, tabsCsv, customersCsv, layoutId }) =>
  callProcedure(`CALL routine_correct_address (:companies, :organisationId, :tabs, :customers, :layoutId);`, {
    companies: companiesCsv,
    organisationId,
    tabs: tabsCsv,
    customers: customersCsv,
    layoutId,
  });

const correctNames = ({ companiesCsv, organisationId, tabsCsv, customersCsv }) =>
  callProcedure(`CALL routine_correct_names (:companies, :organisationId, :tabs, :customers);`, {
    companies: companiesCsv,
    organisationId,
    tabs: tabsCsv,
    customers: customersCsv,
  });

// ---- incorrect names ----

const tenantRepresentativeName = (tenant, companyIds) =>
  q.selectValue(
    tenant,
    `SELECT representative_name FROM representative WHERE company_id IN (:companyIds) LIMIT 1`,
    { companyIds },
    'representative_name',
    ''
  );

const originalAssigneeName = (name) =>
  q.selectValue(
    connections.applicationNew,
    `SELECT ee.original_name FROM db_uspto.assignee AS ee
      INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id
      WHERE name = :name LIMIT 1`,
    { name },
    'original_name',
    null
  );

const incorrectNamesList = ({ organisationId, companies, id, bankMode }) => {
  const hasCompanies = companies.length > 0;
  const sql = `SELECT name, assignor_and_assignee_id AS id, COUNT(application) AS count_assets, 0 AS distance FROM (
    SELECT IF(assignee.original_name != '', assignee.original_name, assignee.ee_name) AS name,
           aaa.assignor_and_assignee_id, doc.appno_doc_num AS application
      FROM db_uspto.assignee AS assignee
      INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = assignee.assignor_and_assignee_id
      INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = assignee.rf_id
      INNER JOIN db_uspto.list1 ON list1.assignor_and_assignee_id = aaa.assignor_and_assignee_id
             AND (list1.organisation_id = :organisationId OR list1.organisation_id IS NULL)
             ${hasCompanies ? 'AND list1.company_id IN (:companies)' : ''}
     WHERE assignee.rf_id IN (
       SELECT rf_id FROM db_new_application.dashboard_items
        WHERE type = 17 AND organisation_id = :organisationId
        ${bankMode ? 'AND mode IN (:mode)' : ''}
        ${hasCompanies ? 'AND representative_id IN (:companies)' : ''})
     ${id > 0 ? 'AND aaa.assignor_and_assignee_id = :id' : ''}
    ) AS temp GROUP BY name ORDER BY LENGTH(name) ASC`;

  const repl = { organisationId };
  if (hasCompanies) repl.companies = companies;
  if (bankMode) repl.mode = 1;
  if (id > 0) repl.id = id;
  return q.selectAll(connections.applicationNew, sql, repl);
};

// ---- correction queues ----

const tenantAddress = (tenant, addressId) =>
  q.selectOne(
    tenant,
    `SELECT address_id, street_address, suite, city, state, country, zip_code
       FROM address WHERE address_id = :addressId LIMIT 1`,
    { addressId }
  );

const QUEUE_BASE = `
  FROM db_uspto.assignment AS assignment
  INNER JOIN db_uspto.assignment_conveyance AS assignment_conveyance ON assignment_conveyance.rf_id = assignment.rf_id
  INNER JOIN db_uspto.assignee AS assignee ON assignee.rf_id = assignment.rf_id
  WHERE assignee.assignor_and_assignee_id IN (
    SELECT assignor_and_assignee_id FROM db_uspto.list1
     WHERE company_id IN (:companyIds) AND (organisation_id = :organisationId OR organisation_id IS NULL))
    AND assignment.rf_id IN (:rfIds)`;

const QUEUE_COMMON_COLS = `
  IF(assignee.original_name != '', assignee.original_name, assignee.ee_name) AS name,
  TRIM(CONCAT(assignee.ee_address_1, ' ', assignee.ee_address_2, ' ', assignee.ee_city, ' ',
              assignee.ee_state, ' ', assignee.ee_postcode, ' ', assignee.ee_country)) AS current_address,
  assignment_conveyance.convey_ty,
  (SELECT date_format(assignor.exec_dt, '%b %d, %Y') FROM db_uspto.assignor AS assignor
    WHERE assignor.rf_id = assignment.rf_id LIMIT 1) AS exec_dt,
  date_format(record_dt, '%b %d, %Y') AS record_dt,
  (SELECT COUNT(documentid.appno_doc_num) FROM db_uspto.documentid AS documentid
    WHERE documentid.rf_id = assignment.rf_id) AS assets,
  IF(cname != '', cname, caddress_1) AS original_correspondence`;

// New values are BOUND, not interpolated - the legacy queries spliced them into
// the SQL string (an injection hole via address fields / new_name).
const queueAddressList = ({ newAddressId, newAddress, companyIds, rfIds, organisationId }) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT assignment.rf_id AS id, :newAddressId AS new_address_id, ${QUEUE_COMMON_COLS},
            :newAddress AS new_address ${QUEUE_BASE}`,
    { newAddressId, newAddress, companyIds, rfIds, organisationId }
  );

const tenantRepresentativeNameById = (tenant, representativeIds) =>
  q.selectValue(
    tenant,
    `SELECT representative_name FROM representative WHERE representative_id IN (:representativeIds) LIMIT 1`,
    { representativeIds },
    'representative_name',
    null
  );

const queueNameList = ({ newName, companyIds, rfIds, organisationId }) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT assignment.rf_id AS id, ${QUEUE_COMMON_COLS},
            :newName AS new_name ${QUEUE_BASE}`,
    { newName, companyIds, rfIds, organisationId }
  );

// ---- :layout parties / activities ----

// Parties for a non-default layout: dashboard_items joined to the biblio
// assignor_and_assignee + representative, with window running totals.
const partiesByLayout = ({ companies, layoutId, organisationId, bankMode }) => {
  const sql = `SELECT id, entityName, totalTransactions, totalAssets,
      SUM(totalTransactions) OVER (ORDER BY id) AS grand_total,
      SUM(totalAssets) OVER (ORDER BY id) AS grand_total_assets
    FROM (
      SELECT assignor_and_assignee.assignor_and_assignee_id AS id,
             IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS entityName,
             COUNT(application) AS totalAssets, 0 AS totalTransactions, COUNT(application) AS assets
        FROM db_new_application.dashboard_items AS apt
        INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS assignor_and_assignee
                ON assignor_and_assignee.assignor_and_assignee_id = apt.assignor_id
        LEFT JOIN db_uspto.representative AS representative
               ON representative.representative_id = assignor_and_assignee.representative_id
       WHERE (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)
         AND apt.representative_id IN (:companies)
         AND apt.type = :layoutId ${bankMode ? 'AND apt.mode IN (:mode)' : ''}
       GROUP BY entityName) AS temp1`;
  const repl = { companies, layoutId, organisationId };
  if (bankMode) repl.mode = 1;
  return q.selectAll(connections.applicationNew, sql, repl);
};

/**
 * Parties for the default layout (15): activity_parties_transactions filtered
 * through the cross-charset assets<->documentid subquery. Fixes two legacy
 * defects: companies/tabs were bound as one comma-joined string (matching
 * nothing for multiple values), and the subquery carried a hardcoded
 * company_id IN (125616) debug literal instead of the bound companies.
 */
const partiesDefault = ({ companies, tabs, customerType, layoutId, organisationId }) => {
  const sql = `SELECT *, SUM(totalTransactions) OVER (ORDER BY id) AS grand_total,
      SUM(totalAssets) OVER (ORDER BY id) AS grand_total_assets
    FROM (
      SELECT id, entityName, totalTransactions,
             (SELECT COUNT(*) FROM (SELECT appno_doc_num FROM db_uspto.documentid
                WHERE rf_id IN (totalIDs) GROUP BY appno_doc_num) AS temp) AS totalAssets
        FROM (
          SELECT id, entityName, GROUP_CONCAT(DISTINCT rfID) AS totalIDs, COUNT(DISTINCT rfID) AS totalTransactions
            FROM (
              SELECT apt.assignor_and_assignee_id AS id,
                     IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS entityName,
                     apt.rf_id AS rfID
                FROM db_new_application.activity_parties_transactions AS apt
                INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee
                        ON assignor_and_assignee.assignor_and_assignee_id = apt.assignor_and_assignee_id
                LEFT JOIN db_uspto.representative AS representative
                       ON representative.representative_id = assignor_and_assignee.representative_id
               WHERE apt.company_id IN (:companies) AND apt.organisation_id = :organisationId
                 AND apt.rf_id IN (
                   SELECT documentid.rf_id
                     FROM db_new_application.assets AS assets
                     INNER JOIN db_uspto.documentid AS documentid
                             ON documentid.appno_doc_num = CONVERT(assets.appno_doc_num USING latin1)
                            AND documentid.grant_doc_num = CONVERT(assets.grant_doc_num USING latin1)
                    WHERE assets.layout_id = :layoutId AND apt.company_id IN (:companies)
                      AND assets.organisation_id = :organisationId
                    GROUP BY documentid.rf_id)
                 AND ${tabs.length ? 'apt.activity_id IN (:tabs)' : 'apt.activity_id > 0'}
                 AND ${customerType === 1 ? 'apt.activity_id = 10' : 'apt.activity_id <> 10'}
               GROUP BY entityName, rfID) AS party
           GROUP BY entityName) AS temp1) AS temp2`;
  const repl = { companies, layoutId, organisationId };
  if (tabs.length) repl.tabs = tabs;
  return q.selectAll(connections.applicationNew, sql, repl);
};

// Activities stored procedure (CSV args by contract).
const layoutActivities = ({ companiesCsv, organisationId, layoutId }) =>
  callProcedure('CALL `routine_activities`(:companies, :organisationId, :layoutId);', {
    companies: companiesCsv,
    organisationId,
    layoutId,
  });

// Business-side existence check for the caller's organisation.
const organisationExists = (orgId) =>
  q.exists(connections.business, `SELECT 1 FROM organisation WHERE organisation_id = :orgId`, { orgId });

// Assets recorded on one rf_id (db_application.documentid, latin1-local).
const rfIdAssets = (rfId) =>
  q.selectAll(
    connections.application,
    `SELECT CONCAT(appno_doc_num, grant_doc_num) AS id,
            CASE WHEN grant_doc_num = '' THEN appno_doc_num ELSE grant_doc_num END AS name,
            CASE WHEN grant_doc_num = '' THEN 1 ELSE 0 END AS type,
            appno_doc_num, grant_doc_num, 3 AS level
       FROM documentid WHERE rf_id = :rfId
      ORDER BY CAST(name AS UNSIGNED) ASC`,
    { rfId }
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
  transactionsByGroupIds,
  correctAddress,
  correctNames,
  tenantRepresentativeName,
  originalAssigneeName,
  incorrectNamesList,
  tenantAddress,
  queueAddressList,
  tenantRepresentativeNameById,
  queueNameList,
  partiesByLayout,
  partiesDefault,
  layoutActivities,
  organisationExists,
  rfIdAssets,
};
