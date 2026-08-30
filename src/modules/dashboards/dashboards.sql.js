'use strict';

/**
 * Pure SQL builders for the two branching dashboard endpoints (POST / and
 * POST /temp). They return { sql, replacements, plain } and touch no
 * connection, so the branch matrix is unit-testable without a database.
 *
 * Collation notes (see COLLATION.md; column collations verified against the
 * 29 Aug 2026 information_schema dump):
 *   db_new_application.dashboard_items.application  utf8mb4_general_ci
 *   db_new_application.assets.appno_doc_num         utf8mb4_0900_ai_ci
 *   db_new_application.assets_with_bank.appno_doc_num  utf32_general_ci
 *   db_uspto.documentid.appno_doc_num               latin1_swedish_ci  (indexed)
 *   db_patent_maintainence_fee.event_maintainence_fees.appno_doc_num  latin1_swedish_ci
 *   db_patent_application_bibliographic.application_grant.grant_doc_num  utf8mb4_general_ci
 *
 * Several of these predicates compared columns of different charsets with no
 * coercion at all in the legacy code, which MySQL 8 rejects with error 1267
 * (see AUDIT_REPORT.md). The coercion is added here on the small / already
 * filtered side so the db_uspto indexes stay usable.
 */

// db_uspto.documentid.appno_doc_num rendered for comparison against
// dashboard_items.application. Placed in a subquery SELECT list, so no index
// on the db_uspto side is lost.
const DOC_APPNO_AS_DASHBOARD = "CONVERT(appno_doc_num USING utf8mb4) COLLATE utf8mb4_general_ci";

// The reverse: a utf8mb4/utf32 asset number rendered for comparison against a
// bare (indexed) db_uspto latin1 column. Application numbers are ASCII, so
// narrowing is lossless — see COLLATION.md §2 corollary.
const asLatin1 = (expr) => `CONVERT(${expr} USING latin1)`;

const MAINTENANCE_LATE_EVENT_CODES = [
  'F176', 'M1554', 'M1555', 'M1556', 'M1557', 'M1558', 'M176', 'M177', 'M178',
  'M181', 'M182', 'M186', 'M187', 'M188', 'M2554', 'M2555', 'M2556', 'M2558',
  'M277', 'M281', 'M282', 'M286', 'M3554', 'M3555', 'M3556', 'M3557', 'M3558',
];

const FILED_EVENT_CODES = ['M1551', 'M2552', 'M3553'];

// Metric types whose response is a list rather than a single row.
const LIST_TYPES = [38, 39, 40, 41];

const TRANSACTION_TABLES = {
  21: 'activity_parties_transactions',
  27: 'borrowers_activity_parties_transactions',
};

/** The transaction-timeline projection shared by POST / (21, 27) and /timeline. */
const transactionColumns = (table) => `SELECT apt.rf_id as id, assign.reel_no, assign.frame_no, exec_dt,
    release_rf_id, release_exec_dt, apt.full_match AS partial_transaction,
    total_assets AS releaseAssets, all_release_ids,
    assign1.reel_no AS release_reel_no, assign1.frame_no AS release_frame_no,
    IF(r.representative_name <> '', r.representative_name, aaa.name) AS customerName,
    activity_id AS tab_id, company_id AS company,
    (SELECT count(asset) FROM (
       SELECT IF(dd.grant_doc_num <> '', dd.grant_doc_num, dd.appno_doc_num) AS asset
         FROM db_uspto.documentid AS dd WHERE dd.rf_id = apt.rf_id GROUP BY asset
     ) AS temp) AS totalAssets
  FROM ${table} AS apt
  INNER JOIN db_uspto.assignment AS assign ON assign.rf_id = apt.rf_id
  LEFT JOIN db_uspto.assignment AS assign1 ON assign1.rf_id = apt.release_rf_id
  INNER JOIN db_uspto.assignor_and_assignee AS aaa
         ON aaa.assignor_and_assignee_id = apt.assignor_and_assignee_id
  LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id`;

/* ------------------------------------------------------------------ POST / */

/**
 * Build the metric query for POST /dashboards.
 *
 * @param {object} input
 * @param {number} input.type          dashboard metric type
 * @param {number} input.dataFormat    1 = cumulative-by-year series
 * @param {boolean} input.bank         format_type === 'bank'
 * @param {boolean} input.bankMode     caller's organisation is a bank (org_type 2)
 * @param {number[]} input.companies   representative ids
 * @param {number[]} input.parties     assignor_and_assignee ids
 * @param {number[]} input.transactions rf_ids
 * @param {string[]} input.ownedAssets application numbers (type 38 only)
 * @param {number} input.year          appno/exec year floor
 * @returns {{sql: string, replacements: object, plain: boolean}|null}
 */
const buildMetricQuery = (input) => {
  const {
    type, dataFormat, bank, bankMode, companies, parties, transactions, ownedAssets, year,
  } = input;

  const repl = { year, organisationId: 0, type };
  if (companies.length) repl.companies = companies;
  if (bankMode) repl.mode = 1;

  const hasCompanies = companies.length > 0;
  const modeClause = bankMode ? ' AND mode IN (:mode) ' : '';
  const companyClause = hasCompanies ? ' AND representative_id IN (:companies) ' : '';

  let listTypes = LIST_TYPES;
  let sql = '';

  if (bank) {
    if (parties.length) repl.parties = parties;
    if (transactions.length) repl.transactions = transactions;
    const partyClause = parties.length ? ' AND assignor_id IN (:parties) ' : '';
    // dashboard_items.application (utf8mb4_general_ci) vs documentid.appno_doc_num
    // (latin1): coerce the small rf_id-filtered db_uspto side.
    const transactionAssets = `SELECT ${DOC_APPNO_AS_DASHBOARD} FROM db_uspto.documentid WHERE rf_id IN (:transactions)`;

    switch (type) {
      // Non-expired / non-client / invalid collaterals, broken chain, expired
      // collateral, conflicting transactions, encumbrances, late recording.
      case 1: case 18: case 19: case 20: case 22: case 23: case 24: case 25: {
        repl.layoutId = type === 1 ? 1 : 15;
        const total = transactions.length
          ? `(SELECT COUNT(DISTINCT appno_doc_num) FROM db_uspto.documentid WHERE rf_id IN (:transactions)) AS total`
          : 'total';
        sql = `SELECT COUNT(application) AS number, application, patent, rf_id, ${total}
          FROM (SELECT application, patent, rf_id, total FROM dashboard_items
                 WHERE type = :type AND organisation_id = :organisationId
                 ${partyClause} ${companyClause} ${modeClause}
                 ${transactions.length ? `AND application IN (${transactionAssets})` : ''}
                 GROUP BY application) AS temp`;
        break;
      }

      // Client transactions / other banks.
      case 21: case 27: {
        listTypes = [21, 27];
        repl.activityIds = [5, 12];
        sql = `${transactionColumns(TRANSACTION_TABLES[type])}
          WHERE (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)
            AND company_id IN (:companies)
            AND apt.rf_id IN (
              SELECT di.rf_id FROM dashboard_items AS di
               WHERE organisation_id = :organisationId AND representative_id IN (:companies)
                 AND type = :type ${partyClause} ${bankMode ? ' AND mode = (:mode) ' : ''}
                 ${transactions.length ? ' AND di.rf_id IN (:transactions) ' : ''}
               GROUP BY di.rf_id)
            AND apt.activity_id IN (:activityIds)
            ${parties.length ? ' AND apt.assignor_and_assignee_id IN (:parties) ' : ''}
            AND date_format(apt.exec_dt, '%Y') > :year
          GROUP BY apt.rf_id ORDER BY exec_dt DESC`;
        break;
      }

      // Collateralized assets / client current assets.
      case 17: case 26:
        sql = `SELECT COUNT(IF(patent <> '', patent, null)) AS number,
                 COUNT(IF(patent = '', application, null)) AS other_number,
                 COUNT(*) AS total, patent, application, '' AS rf_id, type
            FROM dashboard_items
           WHERE type = :type AND organisation_id = :organisationId
             ${partyClause} ${companyClause} ${modeClause}
             ${transactions.length ? `AND application IN (${transactionAssets})` : ''}`;
        break;

      default:
        sql = '';
    }
  } else {
    if (type === 38 && ownedAssets.length) repl.list = ownedAssets;

    switch (type) {
      // Encumbrances / broken chain / maintenance, as an asset count or a
      // cumulative-by-filing-year series.
      case 1: case 18: case 20: case 21: case 22: case 23: case 26: {
        repl.layoutId = type === 1 ? 1 : 15;
        if (dataFormat === 1) {
          // application_grant.grant_doc_num is utf8mb4_general_ci, the same as
          // dashboard_items.patent, so type 22 needs no coercion. assets.appno_doc_num
          // is utf8mb4_0900_ai_ci, so the dashboard_items side is collated to match
          // and assets' index is preserved.
          const join = type === 22
            ? `INNER JOIN db_patent_application_bibliographic.application_grant AS assets
                       ON assets.grant_doc_num = dt.patent`
            : `INNER JOIN db_new_application.assets AS assets
                       ON assets.appno_doc_num = dt.application COLLATE utf8mb4_0900_ai_ci`;
          sql = `SELECT year, sum(number) over (order by year) as number, application, patent, rf_id FROM (
              SELECT year, COUNT(year) AS number, application, patent, '' AS rf_id FROM (
                SELECT assets.appno_doc_num AS application, assets.grant_doc_num AS patent,
                       date_format(assets.appno_date, '%Y') AS year
                  FROM db_new_application.dashboard_items AS dt
                  ${join}
                 WHERE dt.organisation_id = :organisationId AND dt.type = :type
                   AND dt.representative_id IN (:companies)
                   ${bankMode ? ' AND dt.mode IN (:mode) ' : ''}
                   ${type !== 22 ? `AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)
                       AND assets.layout_id = :layoutId AND assets.company_id IN (:companies)` : ''}
                   AND date_format(assets.appno_date, '%Y') > :year
                 GROUP BY assets.appno_doc_num) AS temp
               GROUP BY year) AS temp1`;
        } else {
          const counted = type === 22 ? 'patent' : 'application';
          sql = `SELECT COUNT(${counted}) AS number, application, patent, rf_id, total
            FROM (SELECT application, patent, rf_id, total FROM dashboard_items
                   WHERE type = :type AND organisation_id = :organisationId
                   ${companyClause} ${modeClause}
                   ${type === 22 ? " AND patent <> '' " : ''}
                   GROUP BY ${counted}) AS temp`;
        }
        break;
      }

      // Incorrect names / incorrect recording / late recording — counted by
      // transaction rather than by asset.
      case 17: case 19: case 24: case 25:
        repl.layoutId = 15;
        if (dataFormat === 1) {
          sql = `SELECT year, sum(number) over (order by year) as number, application, patent, rf_id FROM (
              SELECT year, COUNT(year) AS number, '' AS application, '' AS patent, rf_id FROM (
                SELECT dt.rf_id, date_format(apt.exec_dt, '%Y') AS year
                  FROM db_new_application.dashboard_items AS dt
                  INNER JOIN db_new_application.activity_parties_transactions AS apt ON apt.rf_id = dt.rf_id
                 WHERE dt.organisation_id = :organisationId
                   AND (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)
                   AND apt.company_id IN (:companies) AND dt.representative_id IN (:companies)
                   AND dt.type = :type AND date_format(apt.exec_dt, '%Y') > :year
                   ${bankMode ? ' AND dt.mode IN (:mode) ' : ''}
                 GROUP BY dt.rf_id) AS temp
               GROUP BY year) AS temp1`;
        } else {
          sql = `SELECT COUNT(rf_id) AS number, '' AS application, '' AS patent, rf_id, total
            FROM (SELECT rf_id, total FROM dashboard_items
                   WHERE type = :type AND organisation_id = :organisationId
                   ${companyClause} ${modeClause} GROUP BY rf_id) AS temp`;
        }
        break;

      case 30: case 31: case 32: case 33: case 34: case 36:
        sql = `SELECT COUNT(IF(patent <> '', patent, null)) AS number,
                 COUNT(IF(patent = '', application, null)) AS other_number,
                 COUNT(*) AS total, patent, application, '' AS rf_id, type
            FROM dashboard_items
           WHERE type = :type AND organisation_id = :organisationId ${companyClause} ${modeClause}`;
        break;

      case 35:
        sql = `SELECT SUM(total) AS number, application, patent, '' AS rf_id, 0 AS total, type
            FROM dashboard_items
           WHERE type = :type AND organisation_id = :organisationId ${companyClause} ${modeClause}`;
        break;

      // Top non-US family members.
      case 38:
        if (!ownedAssets.length) break;
        sql = `SELECT cwc.name AS name, COUNT(application_country) AS number, (
            SELECT application_number FROM (
              SELECT grant_doc_num, application_number, COUNT(DISTINCT application_country) AS counter FROM (
                SELECT grant_doc_num, application_number, application_country
                  FROM db_uspto.assets_family AS af
                 WHERE grant_doc_num IN (
                   SELECT grant_doc_num FROM db_uspto.documentid AS di
                    WHERE appno_doc_num IN (:list) GROUP BY grant_doc_num)
                   AND application_country NOT IN ('WO', 'US')
                 GROUP BY application_number) AS temp
              INNER JOIN db_uspto.country_with_codes AS cwc ON cwc.country_code = temp.application_country
              GROUP BY grant_doc_num ORDER BY counter DESC LIMIT 1) AS temp
          ) AS patent, '' AS application, '' AS rf_id, 0 AS total FROM (
            SELECT grant_doc_num, application_number, application_country
              FROM db_uspto.assets_family AS af
             WHERE grant_doc_num IN (
               SELECT grant_doc_num FROM db_uspto.documentid AS di
                WHERE appno_doc_num IN (:list) GROUP BY grant_doc_num)
               AND application_country NOT IN ('WO', 'US', 'EP')
             GROUP BY application_number) AS temp
          INNER JOIN db_uspto.country_with_codes AS cwc ON cwc.country_code = temp.application_country
          GROUP BY application_country ORDER BY number DESC, name ASC`;
        break;

      // Proliferate inventors (39, capped at 50) / top lenders (41).
      case 39: case 41:
        sql = `SELECT inventorName AS name, COUNT(rf_id) AS number, application, '' As patent,
                 '' AS rf_id, 0 AS total FROM (
            SELECT aaa.assignor_and_assignee_id,
                   IF(aaa.representative_id <> '', r.representative_name, aaa.name) AS inventorName,
                   application, rf_id
              FROM dashboard_items AS di
              INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = di.assignor_id
              LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id
             WHERE di.type = :type AND di.organisation_id = :organisationId
             ${hasCompanies ? ' AND di.representative_id IN (:companies) ' : ''}
             ${bankMode ? ' AND di.mode IN (:mode) ' : ''}) AS temp
          GROUP BY inventorName ORDER BY number DESC, name ASC${type === 39 ? ' LIMIT 50' : ''}`;
        break;

      case 40:
        sql = `SELECT lawfirm AS name, COUNT(rf_id) AS number, application, '' As patent,
                 '' AS rf_id, 0 AS total, type
            FROM dashboard_items
           WHERE type = :type AND organisation_id = :organisationId ${companyClause} ${modeClause}
           GROUP BY lawfirm ORDER BY number DESC, name ASC`;
        break;

      default:
        sql = '';
    }
  }

  if (!sql) return null;
  return { sql, replacements: repl, plain: !(dataFormat === 1 || listTypes.includes(type)) };
};

/* -------------------------------------------------------------- POST /temp */

/**
 * Assets-with-bank pre-query for POST /temp in bank mode. Types 24 and 25 need
 * the asset numbers themselves; every other type only needs the count.
 */
const buildBankAssetsQuery = ({ type, companies, parties }) => {
  const wantsList = type === 24 || type === 25;
  const repl = { organisationId: 0, companies };
  if (parties.length) repl.parties = parties;
  const sql = `SELECT ${wantsList ? 'appno_doc_num' : 'COUNT(*) AS total'}
      FROM db_new_application.assets_with_bank
     WHERE company_id IN (:companies) AND organisation_id = :organisationId
     ${parties.length ? ' AND assignor_id IN (:parties) ' : ''}
     ${wantsList ? ' GROUP BY appno_doc_num' : ''}`;
  return { sql, replacements: repl, plain: !wantsList, wantsList };
};

/** Owned-asset pre-query for POST /temp outside bank mode. */
const buildOwnedAssetsQuery = ({ type, companies, tabs, customers, assignments, year }) => {
  const repl = { year, organisationId: 0, layoutId: type === 1 ? type : 15 };
  if (companies.length) repl.companies = companies;
  if (tabs.length) repl.tabs = tabs;
  if (customers.length) repl.customers = customers;
  if (assignments.length) repl.assignments = assignments;

  let sql = `SELECT appno_doc_num FROM db_new_application.assets AS assets
     WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutId
       AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)`;
  if (companies.length) sql += ` AND assets.company_id IN (:companies)`;

  const filtered = assignments.length > 0 || tabs.length > 0 || customers.length > 0;
  if (filtered || tabs.length === 0) {
    // assets.appno_doc_num is utf8mb4; documentid.appno_doc_num is latin1 and
    // indexed, so the utf8mb4 side is narrowed (application numbers are ASCII).
    let inner = `SELECT ${asLatin1('documentid.appno_doc_num')} FROM db_uspto.documentid
        WHERE rf_id IN (SELECT activity_parties_transactions.rf_id
                          FROM db_new_application.activity_parties_transactions
                         WHERE (activity_parties_transactions.organisation_id = :organisationId
                                OR activity_parties_transactions.organisation_id IS NULL)`;
    if (companies.length) inner += ` AND activity_parties_transactions.company_id IN (:companies)`;
    if (filtered) {
      if (assignments.length) inner += ` AND activity_parties_transactions.rf_id IN (:assignments)`;
      if (tabs.length) inner += ` AND activity_parties_transactions.activity_id IN (:tabs)`;
      if (customers.length) inner += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)`;
    }
    inner += ` GROUP BY activity_parties_transactions.rf_id) GROUP BY documentid.appno_doc_num`;
    sql += ` AND ${asLatin1('assets.appno_doc_num')} IN (${inner})`;
  }
  return { sql, replacements: repl };
};

/**
 * Build the aggregate for POST /dashboards/temp once the asset set is known.
 * @returns {{sql: string, replacements: object}|null}
 */
const buildTempQuery = (input) => {
  const { type, bank, companies, parties, assets, list, total, year } = input;
  const repl = { year, organisationId: 0, layoutId: type, total };
  if (companies.length) repl.companies = companies;

  let sql = '';

  if (bank) {
    if (parties.length) repl.parties = parties;
    const partyClause = parties.length ? ' AND assignor_id IN (:parties) ' : '';

    switch (type) {
      case 1: // Broken chain
        sql = `SELECT COUNT(appno_doc_num) AS number, appno_doc_num AS application,
                 grant_doc_num AS patent, '' AS rf_id, :total AS total
            FROM (SELECT appno_doc_num, grant_doc_num FROM db_new_application.assets_bank_broken
                   WHERE company_id IN (:companies)
                     AND (organisation_id = :organisationId OR organisation_id IS NULL)
                   ${partyClause} GROUP BY appno_doc_num) AS temp`;
        break;

      case 17: // Incorrect names
        sql = `SELECT COUNT(appno_doc_num) AS number, '' AS application, '' AS patent,
                 rf_id, :total AS total
            FROM (SELECT appno_doc_num, grant_doc_num, rf_id FROM db_new_application.lost_assets
                   WHERE company_id IN (:companies)
                     AND (organisation_id = :organisationId OR organisation_id IS NULL)
                   ${partyClause} GROUP BY appno_doc_num) AS temp`;
        break;

      case 18: // Encumbrances
        repl.conveyType = 'namechg';
        // assets_with_bank.appno_doc_num is utf32_general_ci; documentid is
        // latin1 and indexed, so the lateral's ASCII key is narrowed.
        sql = `SELECT SUM(count_transactions) AS number, appno_doc_num AS application,
                 grant_doc_num AS patent, '' AS rf_id, :total AS total
            FROM (SELECT COUNT(rac.rf_id) AS count_transactions, rac.rf_id As transaction,
                         d.appno_doc_num, d.grant_doc_num
                    FROM db_uspto.documentid AS d
                    INNER JOIN db_uspto.representative_assignment_conveyance AS rac
                            ON rac.rf_id = d.rf_id AND rac.convey_ty NOT IN (:conveyType)
                    INNER JOIN db_uspto.assignee AS ass ON ass.rf_id = rac.rf_id
                    INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = rac.rf_id
                    INNER JOIN LATERAL (
                      SELECT ${asLatin1('appno_doc_num')} AS appno_doc_num, assignor_id, exec_dt, rf_id
                        FROM db_new_application.assets_with_bank
                       WHERE company_id IN (:companies)
                         AND (organisation_id = :organisationId OR organisation_id IS NULL)
                       ${partyClause} GROUP BY assignor_id, rf_id
                    ) AS max_date ON max_date.appno_doc_num = d.appno_doc_num
                       AND aor.exec_dt > max_date.exec_dt AND max_date.rf_id <> rac.rf_id
                       AND aor.assignor_and_assignee_id = max_date.assignor_id
                   GROUP BY rac.rf_id) AS temp`;
        break;

      case 20: // Invalid collaterals
        repl.year = 2000;
        sql = `SELECT IF(max(expired_assets) <> '', max(expired_assets), '') AS application,
                 '' AS patent, SUM(IF(expired_assets <> '', 1, 0)) AS number, '' AS rf_id, :total AS total
            FROM (SELECT d.appno_doc_num, d.grant_doc_num, (
                    SELECT tawbe.appno_doc_num FROM db_new_application.assets_with_bank_expired AS tawbe
                     WHERE tawbe.appno_doc_num = d.appno_doc_num AND tawbe.expire_date < tawb.exec_dt
                  ) AS expired_assets
                    FROM db_new_application.assets_with_bank AS tawb
                    INNER JOIN db_uspto.documentid AS d ON d.rf_id = tawb.rf_id
                   WHERE tawb.company_id IN (:companies)
                     AND (organisation_id = :organisationId OR organisation_id IS NULL)
                   ${parties.length ? ' AND tawb.assignor_id IN (:parties) ' : ''}
                     AND date_format(d.appno_date, '%Y') >= :year
                   GROUP BY d.appno_doc_num) AS temp`;
        break;

      case 23: // Late maintenance
        repl.eventCodes = MAINTENANCE_LATE_EVENT_CODES;
        sql = `SELECT appno_doc_num AS application, grant_doc_num AS patent, '' AS rf_id,
                 COUNT(event_code) AS number, :total AS total
            FROM (SELECT tawb.appno_doc_num, emf.grant_doc_num, event_code
                    FROM db_new_application.assets_with_bank as tawb
                    INNER JOIN db_patent_maintainence_fee.event_maintainence_fees AS emf
                            ON emf.appno_doc_num = ${asLatin1('tawb.appno_doc_num')}
                   WHERE company_id IN (:companies)
                     AND (organisation_id = :organisationId OR organisation_id IS NULL)
                   ${partyClause} AND emf.event_code IN (:eventCodes)) AS temp`;
        break;

      case 24: // Incorrect recordings
        if (!assets.length) break;
        repl.conveyType = 'correct';
        repl.assets = assets;
        sql = `SELECT '' AS application, '' AS patent, MAX(rf_id) AS rf_id,
                 SUM(total_transactions) AS number,
                 (SELECT COUNT(transactions) FROM (
                    SELECT rf_id AS transactions FROM db_uspto.documentid
                     WHERE appno_doc_num IN (:assets) GROUP BY rf_id) as temp1) AS total
            FROM (SELECT rac.rf_id, COUNT(rac.rf_id) AS total_transactions
                    FROM db_new_application.assets_with_bank as tawb
                    INNER JOIN (SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                 WHERE appno_doc_num IN (:assets)
                                 GROUP BY appno_doc_num, rf_id) AS doc
                            ON doc.appno_doc_num = ${asLatin1('tawb.appno_doc_num')}
                    INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = doc.rf_id
                   WHERE company_id IN (:companies)
                     AND (organisation_id = :organisationId OR organisation_id IS NULL)
                   ${partyClause} AND rac.convey_ty = :conveyType
                   GROUP BY tawb.appno_doc_num) AS temp`;
        break;

      case 25: // Late recordings
        if (!assets.length) break;
        repl.assets = assets;
        repl.days = 90;
        sql = `SELECT '' AS application, '' AS patent, MAX(rf_id) AS rf_id, COUNT(rf_id) AS number,
                 (SELECT COUNT(transactions) FROM (
                    SELECT rf_id AS transactions FROM db_uspto.documentid
                     WHERE appno_doc_num IN (:assets) GROUP BY rf_id) as temp1) AS total
            FROM (SELECT temp_exec_dt.rf_id, DATEDIFF(ass.record_dt, temp_exec_dt.exec_dt) AS noOfDays
                    FROM db_new_application.assets_with_bank as tawb
                    INNER JOIN (SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                 WHERE appno_doc_num IN (:assets)
                                 GROUP BY appno_doc_num, rf_id) AS doc
                            ON doc.appno_doc_num = ${asLatin1('tawb.appno_doc_num')}
                    INNER JOIN db_uspto.assignment AS ass ON ass.rf_id = doc.rf_id
                    INNER JOIN LATERAL (
                      SELECT aor.rf_id, aor.exec_dt FROM db_uspto.assignor AS aor
                       INNER JOIN (SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                    WHERE appno_doc_num IN (:assets)
                                    GROUP BY appno_doc_num, rf_id) AS doc1 ON doc1.rf_id = aor.rf_id
                       INNER JOIN db_new_application.assets_with_bank AS tawb1
                               ON ${asLatin1('tawb1.appno_doc_num')} = doc1.appno_doc_num
                       WHERE company_id IN (:companies)
                         AND (organisation_id = :organisationId OR organisation_id IS NULL)
                       ${partyClause} GROUP BY aor.rf_id
                    ) AS temp_exec_dt ON temp_exec_dt.rf_id = ass.rf_id
                   WHERE company_id IN (:companies)
                     AND (organisation_id = :organisationId OR organisation_id IS NULL)
                   GROUP BY temp_exec_dt.rf_id HAVING noOfDays > :days) AS temp`;
        break;

      // 21, 22, 26, 27 have no bank-mode aggregate (they did not in the legacy
      // route either — the cases were present but empty).
      default:
        sql = '';
    }
  } else {
    if (!list.length) return null;
    repl.list = list;
    repl.layoutId = type === 1 ? type : 15;

    switch (type) {
      case 1:
        sql = `SELECT COUNT(appno_doc_num) AS number, max(grant_doc_num) AS patent,
                 max(appno_doc_num) AS application, '' AS rf_id, :total AS total
            FROM (SELECT appno_doc_num, grant_doc_num FROM db_new_application.assets AS assets
                   WHERE date_format(assets.appno_date, '%Y') > :year
                     AND assets.layout_id = :layoutId
                     AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)
                     AND assets.appno_doc_num IN (:list) GROUP BY appno_doc_num) AS temp`;
        break;

      case 17: // Incorrect names
        sql = `SELECT COUNT(appno) AS number, '' AS application, '' AS patent, rf_id, :total AS total
            FROM (SELECT recorded_assignor_and_assignee_id, appno, appnoDt, grantNo, grantDt,
                         rf_id, name, representative_name FROM (
                    SELECT apt.recorded_assignor_and_assignee_id, MAX(appno_doc_num) AS appno,
                           MAX(appno_date) AS appnoDt, MAX(grant_doc_num) AS grantNo,
                           MAX(grant_date) AS grantDt, rac.rf_id, aaa.name AS name,
                           (SELECT representative_name FROM db_uspto.representative
                             WHERE representative_id = aaa.representative_id) AS representative_name
                      FROM db_new_application.activity_parties_transactions AS apt
                      INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = apt.rf_id
                      INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = apt.rf_id
                      INNER JOIN db_uspto.conveyance AS con ON con.convey_name = rac.convey_ty AND con.is_ota = 1
                      INNER JOIN db_uspto.assignor_and_assignee AS aaa
                              ON aaa.assignor_and_assignee_id = apt.recorded_assignor_and_assignee_id
                     WHERE apt.company_id IN (:companies)
                       AND (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)
                       AND appno_doc_num IN (:list)
                     GROUP BY apt.recorded_assignor_and_assignee_id, appno_doc_num, rac.rf_id) AS temp
                   WHERE representative_name <> '' AND LOWER(name) <> LOWER(representative_name)) temp1`;
        break;

      case 18: // Encumbrances
        repl.conveyType = 'namechg';
        sql = `SELECT SUM(count_transactions) AS number, appno_doc_num AS application,
                 grant_doc_num AS patent, '' AS rf_id, :total AS total
            FROM (SELECT COUNT(rac.rf_id) AS count_transactions, rac.rf_id As transaction,
                         d.appno_doc_num, d.grant_doc_num
                    FROM db_uspto.documentid AS d
                    INNER JOIN db_uspto.representative_assignment_conveyance AS rac
                            ON rac.rf_id = d.rf_id AND rac.convey_ty NOT IN (:conveyType)
                    INNER JOIN db_uspto.assignee AS ass ON ass.rf_id = rac.rf_id
                    INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = rac.rf_id
                    INNER JOIN LATERAL (
                      SELECT ${asLatin1('assets.appno_doc_num')} AS appno_doc_num,
                             apt.assignor_and_assignee_id AS assignor_id, apt.exec_dt, apt.rf_id
                        FROM db_new_application.assets AS assets
                        INNER JOIN db_new_application.activity_parties_transactions AS apt
                                ON apt.rf_id = assets.rf_id
                       WHERE assets.company_id IN (:companies)
                         AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)
                         AND assets.appno_doc_num IN (:list)
                       GROUP BY assignor_id, rf_id
                    ) AS max_date ON max_date.appno_doc_num = d.appno_doc_num
                       AND aor.exec_dt > max_date.exec_dt AND max_date.rf_id <> rac.rf_id
                       AND aor.assignor_and_assignee_id = max_date.assignor_id
                   GROUP BY rac.rf_id) AS temp`;
        break;

      case 23: // Late maintenance
        repl.eventCodes = MAINTENANCE_LATE_EVENT_CODES;
        sql = `SELECT appno_doc_num AS application, grant_doc_num AS patent, '' AS rf_id,
                 COUNT(event_code) AS number, :total AS total
            FROM (SELECT tawb.appno_doc_num, emf.grant_doc_num, event_code
                    FROM db_new_application.assets as tawb
                    INNER JOIN db_patent_maintainence_fee.event_maintainence_fees AS emf
                            ON emf.appno_doc_num = ${asLatin1('tawb.appno_doc_num')}
                   WHERE company_id IN (:companies)
                     AND (organisation_id = :organisationId OR organisation_id IS NULL)
                     AND tawb.appno_doc_num IN (:list)
                     AND emf.event_code IN (:eventCodes)) AS temp`;
        break;

      case 24: // Incorrect recordings
        repl.conveyType = 'correct';
        sql = `SELECT '' AS application, '' AS patent, MAX(rf_id) AS rf_id,
                 SUM(total_transactions) AS number,
                 (SELECT COUNT(transactions) FROM (
                    SELECT rf_id AS transactions FROM db_uspto.documentid
                     WHERE appno_doc_num IN (:list) GROUP BY rf_id) as temp1) AS total
            FROM (SELECT rac.rf_id, COUNT(rac.rf_id) AS total_transactions
                    FROM db_new_application.assets as tawb
                    INNER JOIN (SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                 WHERE appno_doc_num IN (:list)
                                 GROUP BY appno_doc_num, rf_id) AS doc
                            ON doc.appno_doc_num = ${asLatin1('tawb.appno_doc_num')}
                    INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = doc.rf_id
                   WHERE company_id IN (:companies)
                     AND (organisation_id = :organisationId OR organisation_id IS NULL)
                     AND rac.convey_ty = :conveyType
                   GROUP BY tawb.appno_doc_num) AS temp`;
        break;

      case 25: // Late recordings
        repl.days = 90;
        sql = `SELECT '' AS application, '' AS patent, MAX(rf_id) AS rf_id, COUNT(rf_id) AS number,
                 (SELECT COUNT(transactions) FROM (
                    SELECT rf_id AS transactions FROM db_uspto.documentid
                     WHERE appno_doc_num IN (:list) GROUP BY rf_id) as temp1) AS total
            FROM (SELECT temp_exec_dt.rf_id, DATEDIFF(ass.record_dt, temp_exec_dt.exec_dt) AS noOfDays
                    FROM db_new_application.assets as tawb
                    INNER JOIN (SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                 WHERE appno_doc_num IN (:list)
                                 GROUP BY appno_doc_num, rf_id) AS doc
                            ON doc.appno_doc_num = ${asLatin1('tawb.appno_doc_num')}
                    INNER JOIN db_uspto.assignment AS ass ON ass.rf_id = doc.rf_id
                    INNER JOIN LATERAL (
                      SELECT aor.rf_id, aor.exec_dt FROM db_uspto.assignor AS aor
                       INNER JOIN (SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                    WHERE appno_doc_num IN (:list)
                                    GROUP BY appno_doc_num, rf_id) AS doc1 ON doc1.rf_id = aor.rf_id
                       INNER JOIN db_new_application.assets AS tawb1
                               ON ${asLatin1('tawb1.appno_doc_num')} = doc1.appno_doc_num
                       WHERE company_id IN (:companies)
                         AND (organisation_id = :organisationId OR organisation_id IS NULL)
                       GROUP BY aor.rf_id
                    ) AS temp_exec_dt ON temp_exec_dt.rf_id = ass.rf_id
                   WHERE company_id IN (:companies)
                     AND (organisation_id = :organisationId OR organisation_id IS NULL)
                   GROUP BY temp_exec_dt.rf_id HAVING noOfDays > :days) AS temp`;
        break;

      default:
        sql = '';
    }
  }

  if (!sql) return null;
  return { sql, replacements: repl };
};

module.exports = {
  buildMetricQuery,
  buildTempQuery,
  buildBankAssetsQuery,
  buildOwnedAssetsQuery,
  transactionColumns,
  asLatin1,
  DOC_APPNO_AS_DASHBOARD,
  MAINTENANCE_LATE_EVENT_CODES,
  FILED_EVENT_CODES,
  LIST_TYPES,
  TRANSACTION_TABLES,
};
