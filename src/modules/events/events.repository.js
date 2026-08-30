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

/** Filing dates for a set of applications, used to draw their term. */
const filingDates = (applications) =>
  q.selectAll(
    app(),
    `SELECT assets.company_id, assets.organisation_id,
            documentid.appno_doc_num AS application, documentid.grant_doc_num AS patent,
            documentid.status, documentid.appno_date
       FROM db_new_application.assets AS assets
       INNER JOIN db_uspto.documentid AS documentid
               ON CONVERT(assets.appno_doc_num USING latin1) = documentid.appno_doc_num
      WHERE documentid.appno_doc_num IN (:applications)
      GROUP BY assets.company_id, assets.organisation_id, documentid.appno_doc_num`,
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
       LEFT JOIN db_patent_maintainence_fee.maintainence_code AS mc ON mc.event_code = emf.event_code
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
  let sql = `SELECT application, patent, '' AS eventdate, '13' AS event_code, '' AS event_icon,
            IF(patent <> '', FORMAT(patent, 0),
               CONCAT(SUBSTRING(application, 1, 2), '/', FORMAT(SUBSTRING(application, 3), 0)))
            AS template_string
       FROM dashboard_items
      WHERE organisation_id = :organisationId AND representative_id IN (:companies)
        ${bankMode ? ' AND mode IN (:mode) ' : ''} AND type = :type`;

  if (customers.length) {
    repl.customers = customers;
    sql += ` AND application IN (
        SELECT CONVERT(documentid.appno_doc_num USING utf8mb4) COLLATE utf8mb4_general_ci
          FROM db_uspto.documentid
         WHERE rf_id IN (SELECT activity_parties_transactions.rf_id
                           FROM db_new_application.activity_parties_transactions
                          WHERE activity_parties_transactions.organisation_id = :organisationId
                            AND activity_parties_transactions.company_id IN (:companies)
                            AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)
                          GROUP BY activity_parties_transactions.rf_id)
         GROUP BY documentid.appno_doc_num)`;
  }
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
