'use strict';

/**
 * Dashboards data access.
 *
 * Reads are raw SELECTs through src/db/query.js; the only write is the share
 * row, which goes through the Sequelize Share model (read/write split).
 */

const { connections } = require('../../db');
const q = require('../../db/query');
const Share = require('../../db/models/share.model');
const sql = require('./dashboards.sql');

const app = () => connections.applicationNew;

/** GET / — dashboard tiles, one row per metric type. */
const tiles = (companies) => {
  const repl = { organisationId: 0 };
  let statement = `SELECT type, title, sub_heading, SUM(number) AS number, patent, application, rf_id
      FROM dashboard_items WHERE organisation_id = :organisationId`;
  if (companies.length) {
    statement += ` AND representative_id IN (:companies)`;
    repl.companies = companies;
  }
  return q.selectAll(app(), `${statement} GROUP BY type`, repl);
};

/** The legacy getOwnedAssets helper: application numbers behind one metric type. */
const ownedApplications = async ({ companies, type, bankMode }) => {
  if (!companies.length) return [];
  const repl = { organisationId: 0, companies, type };
  if (bankMode) repl.mode = 1;
  const rows = await q.selectAll(
    app(),
    `SELECT application FROM dashboard_items
      WHERE organisation_id = :organisationId AND representative_id IN (:companies)
        AND type = :type AND application <> ''
        ${bankMode ? ' AND mode IN (:mode) ' : ''}
      GROUP BY application`,
    repl
  );
  return rows.map((row) => `${row.application}`);
};

/** POST /collateral — reel totals for the collateral metric (type 26). */
const collateral = ({ companies, parties }) => {
  const repl = { organisationId: 0, type: 26, companies };
  let statement = `SELECT rf_id, total, COUNT(application) AS number FROM dashboard_items
      WHERE organisation_id = :organisationId AND representative_id IN (:companies) AND type = :type`;
  if (parties.length) {
    statement += ` AND assignor_id IN (:parties)`;
    repl.parties = parties;
  }
  return q.selectAll(app(), `${statement} GROUP BY rf_id`, repl);
};

/** The caller's own company name, from their tenant database. */
const tenantCompanyName = (tenant, companies) =>
  q.selectValue(
    tenant,
    `SELECT representative_name FROM representative WHERE company_id IN (:companies) LIMIT 1`,
    { companies },
    'representative_name',
    null
  );

/**
 * POST /parties/assignor — counterparties that received assets from the company.
 *
 * The company name is bound as :assignorName; the legacy route spliced it
 * straight into the SQL string (audit finding F8).
 */
const assignorParties = ({ companies, assignorName, activityIds, allAssets, year }) => {
  // db_uspto.documentid.appno_doc_num is latin1 and indexed. The subquery side
  // (dashboard_items / assets, both utf8mb4) is narrowed instead, so the index
  // on the 87GB table survives — COLLATION.md rule 2.
  const subQuery = allAssets
    ? `SELECT ${sql.asLatin1('appno_doc_num')} FROM db_new_application.assets
        WHERE (organisation_id = :organisationId OR organisation_id IS NULL)
          AND company_id IN (:companies) AND layout_id = :layoutId`
    : `SELECT ${sql.asLatin1('application')} FROM dashboard_items
        WHERE organisation_id = :organisationId AND representative_id IN (:companies) AND type = :type`;

  return q.selectAll(
    app(),
    `SELECT assignor_and_assignee_id AS id, name, assignor, COUNT(DISTINCT appno_doc_num) as number FROM (
        SELECT aaa.assignor_and_assignee_id, :assignorName as assignor, aaa.representative_id,
               (CASE WHEN r.representative_name <> "" THEN r.representative_name ELSE aaa.name END) AS name,
               appno_doc_num
          FROM db_uspto.assignee AS ass
          INNER JOIN db_uspto.assignor_and_assignee AS aaa
                  ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id
          LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id
          INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = ass.rf_id
          INNER JOIN db_new_application.activity_parties_transactions AS apt ON doc.rf_id = apt.rf_id
          INNER JOIN db_uspto.assignor AS aor
                  ON aor.assignor_and_assignee_id = apt.recorded_assignor_and_assignee_id
         WHERE date_format(doc.appno_date, '%Y') > :year AND date_format(aor.exec_dt, '%Y') > :year
           AND (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)
           AND apt.company_id IN (:companies) AND activity_id IN (:activityIds)
           AND appno_doc_num IN (${subQuery})) AS temp
      GROUP BY name HAVING name <> assignor ORDER BY number DESC, name ASC`,
    { organisationId: 0, companies, layoutId: 15, activityIds, year, type: 33, assignorName }
  );
};

/** GET /parties/inventor/:inventorID — the inventor's name parts. */
const inventorNames = (inventorId) =>
  q.selectOne(
    app(),
    `SELECT * FROM (
        SELECT assignor_and_assignee_id,
               IF(given_name <> '', CONCAT(' ', given_name), '') AS given_name,
               IF(middle_name <> '', CONCAT(' ', middle_name), '') AS middle_name,
               IF(family_name <> '', CONCAT(' ', family_name), '') AS family_name
          FROM db_patent_application_bibliographic.inventor WHERE assignor_and_assignee_id = :inventorId
        UNION
        SELECT assignor_and_assignee_id,
               IF(given_name <> '', CONCAT(' ', given_name), '') AS given_name,
               IF(middle_name <> '', CONCAT(' ', middle_name), '') AS middle_name,
               IF(family_name <> '', CONCAT(' ', family_name), '') AS family_name
          FROM db_patent_grant_bibliographic.inventor_new WHERE assignor_and_assignee_id = :inventorId
      ) AS temp LIMIT 1`,
    { inventorId }
  );

/** Resolve any of the inventor name permutations back to a party id. */
const partyIdForNames = (names) =>
  q.selectOne(
    app(),
    `SELECT assignor_and_assignee_id AS id FROM db_uspto.assignor_and_assignee
      WHERE name IN (:names) GROUP BY assignor_and_assignee_id LIMIT 1`,
    { names }
  );

/** POST /parties — counterparties on the given activities over an asset set. */
const parties = ({ companies, assigneeName, activityIds, assets, inventors, year }) => {
  const repl = { organisationId: 0, activityIds, year, list: assets, assigneeName };
  if (companies.length) repl.companies = companies;

  if (inventors) {
    // inventor_new.appno_doc_num is utf8mb4_0900_ai_ci and the asset numbers
    // arrive as bound literals, so no coercion is needed here.
    return q.selectAll(
      app(),
      `SELECT assignor_and_assignee_id AS id, name, assignee, SUM(app_count) as number FROM (
          SELECT aaa.assignor_and_assignee_id, aaa.representative_id,
                 IF(r.representative_name <> "", r.representative_name, aaa.name) AS name,
                 COUNT(DISTINCT appno_doc_num) AS app_count, :assigneeName as assignee
            FROM db_patent_grant_bibliographic.inventor_new AS apt
            INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS aaa
                    ON aaa.assignor_and_assignee_id = apt.assignor_and_assignee_id
            LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id
           WHERE appno_doc_num IN (:list)
           GROUP BY aaa.assignor_and_assignee_id) AS temp
        GROUP BY name HAVING assignee <> name ORDER BY number DESC, name ASC`,
      repl
    );
  }

  return q.selectAll(
    app(),
    `SELECT assignor_and_assignee_id AS id, name, assignee, SUM(app_count) as number FROM (
        SELECT aaa.assignor_and_assignee_id, aaa.representative_id,
               (CASE WHEN apt.activity_id = 10 THEN "Employees"
                     WHEN r.representative_name <> "" THEN r.representative_name
                     ELSE aaa.name END) AS name,
               COUNT(DISTINCT appno_doc_num) AS app_count, :assigneeName as assignee
          FROM db_new_application.activity_parties_transactions AS apt
          INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = apt.rf_id
          INNER JOIN db_uspto.assignor_and_assignee AS aaa
                  ON aaa.assignor_and_assignee_id = apt.assignor_and_assignee_id
          LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id
         WHERE (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)
         ${companies.length ? ' AND apt.company_id IN (:companies) ' : ''}
           AND activity_id IN (:activityIds)
           AND date_format(doc.appno_date, '%Y') > :year
           AND appno_doc_num IN (:list)
         GROUP BY aaa.assignor_and_assignee_id) AS temp
      GROUP BY name HAVING assignee <> name ORDER BY number DESC, name ASC`,
    repl
  );
};

/** The representative that owns most of a supplied asset list. */
const dominantCompanyForAssets = (assets) =>
  q.selectOne(
    app(),
    `SELECT representative_id, COUNT(representative_id) AS counter FROM dashboard_items
      WHERE organisation_id = :organisationId AND application IN (:assets)
      ORDER BY counter DESC LIMIT 1`,
    { organisationId: 0, assets }
  );

/** POST /filed_assets_events — the filed patents (metric 31) for a company set. */
const filedApplications = async (companies) => {
  const rows = await q.selectAll(
    app(),
    `SELECT application FROM dashboard_items
      WHERE organisation_id = :organisationId AND representative_id IN (:companies)
        AND type = :type AND patent <> '' GROUP BY patent`,
    { organisationId: 0, companies, type: 31 }
  );
  return rows.map((row) => row.application);
};

/** Maintenance-fee events recorded against those applications. */
const maintenanceEvents = (applications) =>
  q.selectAll(
    app(),
    `SELECT doc.grant_doc_num AS asset, emf.event_code AS code,
            CONCAT(emf.event_code, '-', doc.grant_doc_num) AS asset_event
       FROM db_patent_maintainence_fee.event_maintainence_fees AS emf
       INNER JOIN db_uspto.documentid AS doc ON doc.appno_doc_num = emf.appno_doc_num
      WHERE doc.appno_doc_num IN (:applications) AND event_code IN (:eventCodes)
      GROUP BY asset, asset_event`,
    { applications, eventCodes: sql.FILED_EVENT_CODES }
  );

/** Every party id recorded against a representative (db_resources). */
const recordedPartyIds = async (representativeId) => {
  const rows = await q.selectAll(
    connections.resources,
    `SELECT assignor_and_assignee_id FROM assignor_and_assignee
      WHERE representative_id = :representativeId GROUP BY assignor_and_assignee_id`,
    { representativeId }
  );
  return rows.map((row) => row.assignor_and_assignee_id);
};

/** POST /timeline — the company's transactions, optionally with counterparty logos. */
const timeline = ({ companies, activityIds, recordedIds, parties: partyIds, withLogos, year }) => {
  const repl = { organisationId: 0, companies, activityIds, recordedIds, year };
  if (partyIds.length) repl.parties = partyIds;

  let statement = `${sql.transactionColumns('activity_parties_transactions')}
      WHERE (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)
        AND company_id IN (:companies) AND apt.activity_id IN (:activityIds)
        ${partyIds.length ? ' AND apt.assignor_and_assignee_id IN (:parties) ' : ''}
        AND apt.recorded_assignor_and_assignee_id IN (:recordedIds)
        AND date_format(apt.exec_dt, '%Y') > :year
      GROUP BY apt.rf_id ORDER BY exec_dt DESC`;

  if (withLogos) {
    // organisations.organisation_name and the customerName expression are both
    // utf8mb4, so an explicit COLLATE (not CONVERT) is what pairs them.
    statement = `SELECT temp.*, ao.logo_optimize AS logo FROM (${statement}) AS temp
      LEFT JOIN db_new_application.organisations AS ao ON
        REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(
          LOWER(REPLACE(REPLACE(ao.organisation_name, ',', ''), '.', '')),
          'corporation$', 'corp'), 'incorporated$', 'inc'), 'limited$', 'ltd'), 'company$', 'co')
        COLLATE utf8mb4_general_ci = LOWER(temp.customerName) COLLATE utf8mb4_general_ci
      GROUP BY temp.id`;
  }
  return q.selectAll(app(), statement, repl);
};

/** POST /count — precomputed counters per metric type. */
const counts = ({ companies, types, bankMode }) => {
  const repl = { organisationId: 0, types };
  if (companies.length) repl.companies = companies;
  if (bankMode) repl.mode = 1;
  return q.selectAll(
    app(),
    `SELECT type, number, other_number, total, other FROM dashboard_items_count
      WHERE type IN (:types) AND organisation_id = :organisationId
      ${companies.length ? ' AND representative_id IN (:companies) ' : ''}
      ${bankMode ? ' AND mode IN (:mode) ' : ''}`,
    repl
  );
};

/** POST /example — one representative row for a metric type. */
const example = ({ companies, types, parties: partyIds }) => {
  const repl = { organisationId: 0, types };
  if (companies.length) repl.companies = companies;
  if (partyIds.length) repl.parties = partyIds;
  return q.selectOne(
    app(),
    `SELECT rf_id, patent, application FROM dashboard_items
      WHERE type IN (:types) AND organisation_id = :organisationId
      ${partyIds.length ? ' AND assignor_id IN (:parties) ' : ''}
      ${companies.length ? ' AND representative_id IN (:companies) ' : ''} LIMIT 1`,
    repl
  );
};

/* ------------------------------- the two branching endpoints ------------- */

/** Execute a built POST / metric query. Returns {} / [] when no branch matched. */
const metric = async (input) => {
  const built = sql.buildMetricQuery(input);
  if (!built) return null;
  const rows = await q.selectAll(app(), built.sql, built.replacements);
  if (!built.plain) return rows;
  return rows.length ? rows[0] : {};
};

/** Bank-mode asset pre-query for POST /temp. Returns { total, assets }. */
const bankAssets = async (input) => {
  const built = sql.buildBankAssetsQuery(input);
  if (built.wantsList) {
    const rows = await q.selectAll(app(), built.sql, built.replacements);
    return { total: rows.length, assets: rows.map((row) => row.appno_doc_num) };
  }
  const row = await q.selectOne(app(), built.sql, built.replacements);
  return { total: row ? Number(row.total) : 0, assets: [] };
};

/** Owned-asset pre-query for POST /temp outside bank mode. */
const ownedAssetsForTemp = async (input) => {
  const built = sql.buildOwnedAssetsQuery(input);
  const rows = await q.selectAll(app(), built.sql, built.replacements);
  return rows.map((row) => row.appno_doc_num);
};

/** Execute a built POST /temp aggregate. */
const tempAggregate = async (input) => {
  const built = sql.buildTempQuery(input);
  if (!built) return null;
  const row = await q.selectOne(app(), built.sql, built.replacements);
  return row || {};
};

/* --------------------------------------------------- POST /share (writes) */

/** Companies the caller can see but did not select — drives show_other_companies. */
const countUnselectedCompanies = (tenant, selectedCompanies) =>
  q.selectValue(
    tenant,
    `SELECT COUNT(*) AS c FROM representative
      WHERE status = 1 AND type = 0 AND company_id > 0
        ${selectedCompanies.length ? ' AND company_id NOT IN (:selectedCompanies) ' : ''}`,
    { selectedCompanies },
    'c',
    0
  );

const createShare = (data) => Share.create(data);

module.exports = {
  tiles,
  ownedApplications,
  collateral,
  tenantCompanyName,
  assignorParties,
  inventorNames,
  partyIdForNames,
  parties,
  dominantCompanyForAssets,
  filedApplications,
  maintenanceEvents,
  recordedPartyIds,
  timeline,
  counts,
  example,
  metric,
  bankAssets,
  ownedAssetsForTemp,
  tempAggregate,
  countUnselectedCompanies,
  createShare,
};
