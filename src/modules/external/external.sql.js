'use strict';

/**
 * Resolves "the patents behind this selection" for the citation endpoint.
 *
 * The caller can either hand over a complete asset list, or describe a
 * selection (layout, companies, tabs, counterparties, transactions) for the
 * server to resolve. Which table answers depends on the layout: layouts up to
 * 15 live in db_new_application.assets, the rest are precomputed metrics in
 * dashboard_items.
 *
 * Pure: returns { sql, replacements } so the branch matrix is testable without
 * a database.
 */

const ASSETS_LAYOUT_CEILING = 15;

// assets.appno_doc_num is utf8mb4; db_uspto.documentid.appno_doc_num is latin1
// and indexed. Application numbers are ASCII, so the utf8mb4 side is narrowed
// and the big table keeps its index. See COLLATION.md.
const asLatin1 = (expr) => `CONVERT(${expr} USING latin1)`;

/** The transactions matching the selection, as a subquery over documentid. */
const transactionAssets = ({ companies, assignments, tabs, customers, excludeEmployees }) => {
  let sql = `SELECT ${asLatin1('documentid.appno_doc_num')} FROM db_uspto.documentid
      WHERE rf_id IN (
        SELECT activity_parties_transactions.rf_id
          FROM db_new_application.activity_parties_transactions
         WHERE (activity_parties_transactions.organisation_id = :organisationId
                OR activity_parties_transactions.organisation_id IS NULL)`;
  if (companies.length) sql += ` AND activity_parties_transactions.company_id IN (:companies)`;
  if (assignments.length) sql += ` AND activity_parties_transactions.rf_id IN (:assignments)`;
  if (tabs.length) sql += ` AND activity_parties_transactions.activity_id IN (:tabs)`;
  // Activity 10 is the employee assignments, which are never citation material.
  else if (excludeEmployees) sql += ` AND activity_parties_transactions.activity_id <> 10`;
  if (customers.length) {
    sql += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)`;
  }
  sql += ` GROUP BY activity_parties_transactions.rf_id) GROUP BY documentid.appno_doc_num`;
  return sql;
};

/** Grant numbers from dashboard_items, optionally narrowed by counterparty. */
const fromDashboardItems = ({ companies, assignments, customers, bankMode }) => {
  let sql = `SELECT patent AS grant_doc_num FROM db_new_application.dashboard_items AS assets
      WHERE assets.type = :layoutId
        AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)
        ${bankMode ? ' AND mode IN (:mode) ' : ''} AND patent <> ""`;
  if (companies.length) sql += ` AND assets.representative_id IN (:companies)`;
  if (assignments.length) sql += ` AND assets.rf_id IN (:assignments)`;
  sql += ` GROUP BY patent`;

  if (!customers.length) return sql;

  // Narrowing by counterparty needs the transaction table, so the metric query
  // becomes a subquery of it.
  let outer = `SELECT grant_doc_num FROM db_uspto.documentid AS doc
      INNER JOIN db_new_application.activity_parties_transactions AS apt ON apt.rf_id = doc.rf_id
     WHERE grant_doc_num IN (${sql})
       AND (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)`;
  if (companies.length) outer += ` AND apt.company_id IN (:companies)`;
  if (assignments.length) outer += ` AND apt.rf_id IN (:assignments)`;
  outer += ` AND apt.assignor_and_assignee_id IN (:customers) GROUP BY grant_doc_num`;
  return outer;
};

/**
 * @param {object} input
 * @param {boolean} input.listIsComplete the caller supplied every asset already
 * @param {boolean} input.otherMode read the for-sale list instead
 * @returns {{sql: string, replacements: object}}
 */
const buildGrantNumberQuery = (input) => {
  const {
    layoutId, companies, tabs, customers, assignments, list,
    listIsComplete, otherMode, bankMode, orgId, year,
  } = input;

  const repl = { year, organisationId: 0, orgId, layoutId };
  if (companies.length) repl.companies = companies;
  if (tabs.length) repl.tabs = tabs;
  if (customers.length) repl.customers = customers;
  if (assignments.length) repl.assignments = assignments;
  if (bankMode) repl.mode = 1;

  // The caller already knows the assets: look their grant numbers up directly.
  if (listIsComplete) {
    repl.list = list;
    if (layoutId > ASSETS_LAYOUT_CEILING) {
      return { sql: fromDashboardItems({ companies, assignments, customers, bankMode: false }), replacements: repl };
    }
    // Union the two grant indexes: an asset may be in one and not the other.
    repl.layoutId = ASSETS_LAYOUT_CEILING;
    return {
      sql: `SELECT grant_doc_num FROM db_new_application.assets AS assets
              WHERE date_format(assets.appno_date, '%Y') > :year
                AND assets.layout_id = :layoutId
                AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)
                AND grant_doc_num <> "" AND assets.appno_doc_num IN (:list)
              GROUP BY grant_doc_num
            UNION
            SELECT grant_doc_num COLLATE utf8mb4_general_ci
              FROM db_patent_application_bibliographic.application_grant AS assets
             WHERE date_format(assets.appno_date, '%Y') > :year AND grant_doc_num <> ""
               AND assets.appno_doc_num IN (:list)
             GROUP BY grant_doc_num`,
      replacements: repl,
    };
  }

  if (otherMode) {
    return {
      sql: `SELECT grant_doc_num FROM db_new_application.assets_for_sale AS assets
              WHERE assets.organisation_id = :orgId GROUP BY grant_doc_num`,
      replacements: repl,
    };
  }

  if (layoutId > ASSETS_LAYOUT_CEILING) {
    return { sql: fromDashboardItems({ companies, assignments, customers, bankMode }), replacements: repl };
  }

  let sql = `SELECT grant_doc_num FROM db_new_application.assets AS assets
      WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutId
        AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)
        AND grant_doc_num <> ""`;
  if (companies.length) sql += ` AND assets.company_id IN (:companies)`;

  const hasFilter = assignments.length > 0 || tabs.length > 0 || customers.length > 0;
  if (hasFilter || tabs.length === 0) {
    sql += ` AND ${asLatin1('assets.appno_doc_num')} IN (${transactionAssets({
      companies, assignments, tabs, customers, excludeEmployees: true,
    })})`;
  }
  sql += ` GROUP BY grant_doc_num`;
  return { sql, replacements: repl };
};

module.exports = { buildGrantNumberQuery, transactionAssets, fromDashboardItems, asLatin1, ASSETS_LAYOUT_CEILING };
