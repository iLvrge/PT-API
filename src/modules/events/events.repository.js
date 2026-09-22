'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const { ABANDONED_STATUSES, ALL_WINDOWS } = require('./events.constants');

const app = () => connections.applicationNew;

/** The applications behind one dashboard metric. */
const metricApplications = ({ companies, layoutId, bankMode, withPatent = false }) => {
  const repl = { organisationId: 0, companies, layoutId };
  if (bankMode) repl.mode = 1;
  return q.selectAll(
    app(),
    `SELECT application${withPatent ? ', patent' : ''}
       FROM db_new_application.dashboard_items AS assets
      WHERE assets.organisation_id = :organisationId
        AND representative_id IN (:companies) AND type = :layoutId
        ${bankMode ? ' AND mode IN (:mode) ' : ''}
      GROUP BY application`,
    repl
  );
};

/**
 * The maintenance-fee events recorded against a set of applications.
 * `exclude` drops applications we already know are still pending.
 */
const maintenanceEvents = ({ applications, exclude = [] }) => {
  const repl = { applications, eventCodes: ALL_WINDOWS };
  let sql = `SELECT emf.appno_doc_num, event_code
       FROM db_patent_maintainence_fee.event_maintainence_fees AS emf
      WHERE emf.appno_doc_num IN (:applications)`;
  if (exclude.length) {
    sql += ` AND appno_doc_num NOT IN (:exclude)`;
    repl.exclude = exclude;
  }
  return q.selectAll(app(), `${sql} AND event_code IN (:eventCodes)`, repl);
};

/** How many of a set of applications went abandoned in each year. */
const abandonedByYear = ({ applications, year }) =>
  q.selectAll(
    app(),
    `SELECT date_format(status_date, '%Y') AS year, COUNT(appno_doc_num) AS count
       FROM db_uspto.application_status
      WHERE date_format(status_date, '%Y') > :year
        AND appno_doc_num IN (:applications) AND status IN (:statuses)
      GROUP BY year`,
    { applications, year, statuses: ABANDONED_STATUSES }
  );

/**
 * The life span of the assets in a selection.
 *
 * `routine_life_span` is a stored procedure. Its arguments are comma-joined
 * id lists rather than arrays, which is what the procedure signature takes.
 */
const lifeSpan = ({ layoutId, companies, tabs, customers, assignments }) =>
  app().query(
    'CALL `routine_life_span`(:layoutId, :companies, :organisationId, :tabs, :customers, :assignments)',
    {
      replacements: {
        layoutId,
        companies: companies.join(','),
        organisationId: 0,
        tabs: tabs.join(','),
        customers: customers.join(','),
        assignments: assignments.join(','),
      },
      logging: false,
    }
  );

/**
 * Filing dates for a set of applications, used to draw their term.
 *
 * Reads db_uspto.documentid directly, and only granted patents
 * (`grant_doc_num <> ''`): the life-span chart plots patent terms, and a
 * pending application has no term to plot. `filingDatesFallback` then covers
 * the numbers this does not answer for.
 *
 * It does NOT join db_new_application.assets. That join was what made this
 * unusable: the two tables differ in charset, and converting
 * `assets.appno_doc_num` to compare them hid its index on a 13.4M-row table,
 * so MySQL made it the driving table and scanned 12.6M index entries on every
 * call - ten applications cost the same 90 seconds as a thousand, and the
 * panel's request never returned. Nothing in the series needs a column from
 * `assets`, so the join is simply gone; the remaining filter is on
 * documentid's own indexed `appno_doc_num`.
 */
/**
 * An anti-join that drops assets the organisation has already divested.
 *
 * Written as LEFT JOIN ... IS NULL rather than
 *   NOT IN (SELECT application FROM dashboard_items WHERE ...)
 * or `NOT IN (:divestedList)` with the ids fetched first, which is what the
 * original did. Both shapes are banned here: the subquery form materialises
 * dashboard_items before a single asset can be tested, and the list form grows
 * an IN clause with one entry per divested asset.
 *
 * `dashboard_items` has an index on (application, type, organisation_id,
 * representative_id), so this is a keyed lookup per row. The CONVERT() goes on
 * whichever column the *caller* drives from - never on
 * `divested.application`, or that index goes unused.
 */
const DIVESTED_TYPE = 33;
const divestedAntiJoin = (applicationExpr, companies) => `
       LEFT JOIN db_new_application.dashboard_items AS divested
              ON divested.application = ${applicationExpr}
             AND divested.type = :divestedType
             AND divested.organisation_id = :organisationId
             ${companies.length ? 'AND divested.representative_id IN (:companies)' : ''}`;

// db_uspto.documentid is latin1; dashboard_items.application is utf8mb4.
const DOC_APPNO_AS_DASHBOARD =
  'CONVERT(documentid.appno_doc_num USING utf8mb4) COLLATE utf8mb4_general_ci';

const filingDates = (applications, year, { excludeDivested = false, companies = [] } = {}) => {
  const repl = { applications, year };
  let join = '';
  let where = '';
  if (excludeDivested) {
    repl.divestedType = DIVESTED_TYPE;
    repl.organisationId = 0;
    if (companies.length) repl.companies = companies;
    join = divestedAntiJoin(DOC_APPNO_AS_DASHBOARD, companies);
    where = ' AND divested.application IS NULL';
  }

  return q.selectAll(
    app(),
    `SELECT documentid.appno_doc_num AS application, documentid.grant_doc_num AS patent,
            documentid.status, documentid.appno_date
       FROM db_uspto.documentid AS documentid${join}
      WHERE documentid.appno_doc_num IN (:applications)
        AND date_format(documentid.appno_date, '%Y') > :year
        AND documentid.grant_doc_num <> ''${where}
      GROUP BY documentid.appno_doc_num`,
    repl
  );
};

/**
 * The same dates from the bibliographic grant index, for applications the
 * assignment corpus does not carry. A number can be missing from documentid
 * entirely, or be there without a grant number; either way it still belongs on
 * the chart, so the original API ran this second pass over the leftovers.
 */
const filingDatesFallback = (
  applications, year, { excludeDivested = false, companies = [] } = {}
) => {
  const repl = { applications, year };
  let join = '';
  let where = '';
  if (excludeDivested) {
    repl.divestedType = DIVESTED_TYPE;
    repl.organisationId = 0;
    if (companies.length) repl.companies = companies;
    // application_grant.appno_doc_num is already utf8mb4_general_ci, the same
    // as dashboard_items.application, so this side needs no conversion at all.
    join = divestedAntiJoin('ag.appno_doc_num', companies);
    where = ' AND divested.application IS NULL';
  }

  return q.selectAll(
    app(),
    `SELECT ag.appno_doc_num AS application, ag.grant_doc_num AS patent,
            0 AS status, ag.appno_date
       FROM db_patent_application_bibliographic.application_grant AS ag${join}
      WHERE ag.appno_doc_num IN (:applications)
        AND date_format(ag.appno_date, '%Y') > :year${where}
      GROUP BY ag.appno_doc_num`,
    repl
  );
};

/**
 * Patent term extensions, in days. A patent whose prosecution was delayed by
 * the office gets that time back, so its term runs past the usual twenty years
 * and it stays on the chart longer.
 */
const termExtensions = (applications) =>
  q.selectAll(
    app(),
    `SELECT appno_doc_num, extension
       FROM db_patent_application_bibliographic.grant_extension
      WHERE appno_doc_num IN (:applications)`,
    { applications }
  );

/* --------------------------------------------------------- single asset */

/** The maintenance events on one asset, with their code descriptions. */
const eventsForApplication = (applicationNumber) =>
  q.selectAll(
    app(),
    `SELECT emf.grant_doc_num, emf.appno_doc_num, emf.grant_date,
            date_format(emf.event_date, '%Y-%m-%d') AS eventdate,
            emf.event_code, emf.event_icon,
            mc.event_description, mc.template, mc.template_string,
            mc.icon1, mc.icon2, mc.icon3
       FROM db_patent_maintainence_fee.event_maintainence_fees AS emf
       LEFT JOIN db_patent_maintainence_fee.event_maintainence_code AS mc ON mc.event_code = emf.event_code
      WHERE emf.appno_doc_num = :applicationNumber
      GROUP BY eventdate, emf.event_code`,
    { applicationNumber }
  );

/** Resolve either number to the application the maintenance table is keyed on. */
const resolveApplication = ({ applicationNumber, patentNumber }) =>
  q.selectOne(
    app(),
    `SELECT appno_doc_num, MAX(grant_doc_num) AS grant_doc_num, MAX(grant_date) AS grant_date
       FROM db_uspto.documentid
      WHERE appno_doc_num = :applicationNumber OR grant_doc_num = :patentNumber
      GROUP BY appno_doc_num LIMIT 1`,
    { applicationNumber, patentNumber: patentNumber === undefined ? '' : patentNumber }
  );

/** Publication and grant dates, from whichever index holds them. */
const publicationDates = (applicationNumber) =>
  q.selectOne(
    connections.application,
    `SELECT ap.appno_date AS filling_date, ap.pgpub_date
       FROM db_patent_grant_bibliographic.application_publication AS ap
      WHERE ap.appno_doc_num = :applicationNumber LIMIT 1`,
    { applicationNumber }
  );

const grantDates = (applicationNumber) =>
  q.selectOne(
    connections.application,
    `SELECT ag.appno_date AS filling_date, ag.grant_doc_num, ag.grant_date
       FROM db_patent_application_bibliographic.application_grant AS ag
      WHERE ag.appno_doc_num = :applicationNumber LIMIT 1`,
    { applicationNumber }
  );

const documentDates = (applicationNumber) =>
  q.selectOne(
    connections.application,
    `SELECT MAX(appno_date) AS filling_date, MAX(pgpub_date) AS pgpub_date,
            MAX(grant_date) AS grant_date
       FROM db_uspto.documentid WHERE appno_doc_num = :applicationNumber LIMIT 1`,
    { applicationNumber }
  );

/** The prosecution status history of one application. */
const statusHistory = (applicationNumber) =>
  q.selectAll(
    connections.application,
    `SELECT status, date_format(status_date, '%Y-%m-%d') AS status_date
       FROM db_uspto.application_status
      WHERE appno_doc_num = :applicationNumber ORDER BY status_date ASC`,
    { applicationNumber }
  );

/** Assets not yet recorded with the USPTO, for one company set. */
const assetsToRecord = ({ companies, customers, bankMode }) => {
  const repl = { organisationId: 0, companies, type: 22 };
  if (bankMode) repl.mode = 1;

  // Narrowing to the applications on a customer's transactions is a join, not
  //   application IN (SELECT ... WHERE rf_id IN (SELECT ...))
  // That nested pair made MySQL materialise db_uspto.documentid - millions of
  // rows - before it could test a single application. DISTINCT keeps the
  // derived table one row per application, so the join matches what the
  // membership test did without multiplying rows.
  let join = '';
  if (customers.length) {
    repl.customers = customers;
    join = ` INNER JOIN (
        SELECT DISTINCT CONVERT(documentid.appno_doc_num USING utf8mb4)
                 COLLATE utf8mb4_general_ci AS appno
          FROM db_uspto.documentid
          INNER JOIN db_new_application.activity_parties_transactions AS apt
                  ON apt.rf_id = documentid.rf_id
         WHERE apt.organisation_id = :organisationId
           AND apt.company_id IN (:companies)
           AND apt.assignor_and_assignee_id IN (:customers)
      ) AS customerAssets ON customerAssets.appno = dashboard_items.application`;
  }

  const sql = `SELECT dashboard_items.application, dashboard_items.patent, '' AS eventdate,
            '13' AS event_code, '' AS event_icon,
            IF(dashboard_items.patent <> '', FORMAT(dashboard_items.patent, 0),
               CONCAT(SUBSTRING(dashboard_items.application, 1, 2), '/',
                      FORMAT(SUBSTRING(dashboard_items.application, 3), 0)))
            AS template_string
       FROM dashboard_items${join}
      WHERE dashboard_items.organisation_id = :organisationId
        AND dashboard_items.representative_id IN (:companies)
        ${bankMode ? ' AND dashboard_items.mode IN (:mode) ' : ''}
        AND dashboard_items.type = :type`;

  return q.selectAll(app(), sql, repl);
};

/** One unrecorded asset's detail. */
const assetToRecordDetail = (application) =>
  q.selectOne(
    app(),
    `SELECT application, patent, rf_id, total FROM dashboard_items
      WHERE application = :application AND type = :type LIMIT 1`,
    { application, type: 22 }
  );

/** The assets on one transaction, with their maintenance status. */
const transactionAssets = (rfId) =>
  q.selectAll(
    app(),
    `SELECT doc.appno_doc_num AS application, doc.grant_doc_num AS patent, doc.appno_date,
            doc.grant_date, doc.status
       FROM db_uspto.documentid AS doc
      WHERE doc.rf_id = :rfId
      GROUP BY doc.appno_doc_num`,
    { rfId }
  );

module.exports = {
  metricApplications,
  maintenanceEvents,
  abandonedByYear,
  lifeSpan,
  filingDates,
  filingDatesFallback,
  termExtensions,
  eventsForApplication,
  resolveApplication,
  publicationDates,
  grantDates,
  documentDates,
  statusHistory,
  assetsToRecord,
  assetToRecordDetail,
  transactionAssets,
};
