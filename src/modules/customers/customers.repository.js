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

module.exports = {
  companyRepresentativeIds,
  assetTypeTabs,
  assetTypeCompaniesCount,
  assetTypeCompanies,
  assetTypeTabCompanies,
};
