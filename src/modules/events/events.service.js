'use strict';

/**
 * Asset events: maintenance-fee history, abandonment, and the life-span charts
 * that sit on top of them.
 */

const ApiError = require('../../utils/api-error');
const { findLayout, checkTabs } = require('../../shared/layouts');
const repository = require('./events.repository');
const icons = require('./events.icons');
const series = require('./events.lifespan');
const {
  FIRST_WINDOW, SECOND_WINDOW, THIRD_WINDOW, BAR_STYLE, EXPIRY_CODES,
} = require('./events.constants');

const yearFloor = () => new Date().getFullYear() - 24;

/* ------------------------------------------------------------- life span */

/** GET /events/tabs — the life span of everything in a selection. */
const lifeSpanForSelection = async ({ type, companies, tabs, customers, assignments }) => {
  const rows = await repository.lifeSpan({
    layoutId: findLayout(type),
    companies,
    tabs: checkTabs(tabs),
    customers,
    assignments,
  });
  // A CALL comes back as one result set per statement; the first holds the rows.
  const assets = Array.isArray(rows[0]) ? rows[0] : Object.values(rows[0] || {});
  return series.lifeSpan(assets);
};

/** The life span of an explicit asset list. */
const lifeSpanForAssets = async (applications) => {
  if (!applications.length) return [];
  return series.lifeSpan(await repository.filingDates(applications));
};

/* ---------------------------------------------------------- abandonment */

/**
 * POST /events/abandoned/maintainence/assets
 *
 * Where a portfolio stands against the three maintenance-fee windows. An asset
 * that paid the first but not the second was abandoned in the second window,
 * and so on; assets with no grant number never reached a window at all.
 */
const maintenanceAbandonment = async ({ type, companies, bankMode }) => {
  const table = [['Element', 'Assets', { type: 'string', role: 'style' }]];
  if (!companies.length) return table;

  const rows = await repository.metricApplications({
    companies, layoutId: findLayout(type), bankMode, withPatent: true,
  });
  if (!rows.length) return table;

  const applications = rows.map((row) => `${row.application}`);
  // No grant number means it is still an application, not a lapsed patent.
  const pending = rows
    .filter((row) => !row.patent)
    .map((row) => `${row.application}`);

  const events = await repository.maintenanceEvents({ applications, exclude: pending });

  if (pending.length) table.push(['Application', pending.length, BAR_STYLE]);
  if (!events.length) return table;

  const paid = { 1: new Set(), 2: new Set(), 3: new Set() };
  events.forEach((event) => {
    if (FIRST_WINDOW.includes(event.event_code)) paid[1].add(event.appno_doc_num);
    else if (SECOND_WINDOW.includes(event.event_code)) paid[2].add(event.appno_doc_num);
    else if (THIRD_WINDOW.includes(event.event_code)) paid[3].add(event.appno_doc_num);
  });

  const everSeen = new Set([...paid[1], ...paid[2], ...paid[3]]);
  // Assets with no maintenance record at all are still inside the first window.
  const notYetDue = applications.filter((asset) => !everSeen.has(asset));

  const droppedAfterFirst = [...paid[1]].filter((a) => !paid[2].has(a));
  const droppedAfterSecond = [...paid[2]].filter((a) => !paid[3].has(a));

  table.push(['Not yet due', notYetDue.length, BAR_STYLE]);
  table.push(['Lapsed at 7.5 years', droppedAfterFirst.length, BAR_STYLE]);
  table.push(['Lapsed at 11.5 years', droppedAfterSecond.length, BAR_STYLE]);
  table.push(['Maintained', paid[3].size, BAR_STYLE]);
  return table;
};

/** POST /events/abandoned/yearly/assets — abandonments per year. */
const yearlyAbandonment = async ({ type, companies, bankMode }) => {
  if (!companies.length) return series.yearlySeries([]);

  const rows = await repository.metricApplications({
    companies, layoutId: findLayout(type), bankMode,
  });
  if (!rows.length) return series.yearlySeries([]);

  const abandoned = await repository.abandonedByYear({
    applications: rows.map((row) => `${row.application}`),
    year: yearFloor(),
  });
  return series.yearlySeries(abandoned);
};

/* ------------------------------------------------------- events on an asset */

/**
 * The maintenance-fee history of one asset, with the icon set for each event
 * code and whether the patent has expired.
 */
const eventsForAsset = async ({ applicationNumber, patentNumber }) => {
  if (!applicationNumber) throw ApiError.badRequest('An application number is required');

  let events = await repository.eventsForApplication(applicationNumber);

  // The caller may have given us a patent number, or a number the maintenance
  // table does not key on; resolve it and try again.
  if (!events.length) {
    const resolved = await repository.resolveApplication({ applicationNumber, patentNumber });
    if (resolved && resolved.appno_doc_num) {
      events = await repository.eventsForApplication(resolved.appno_doc_num);
    }
  }

  const iconsByCode = {};
  let expired = false;
  let expiredOn = '';

  events.forEach((event) => {
    iconsByCode[event.event_code] = icons.forCode(event);
    if (!expired && EXPIRY_CODES.includes(event.event_code)) {
      expired = true;
      expiredOn = event.eventdate;
    }
  });

  return { events, icons: iconsByCode, expired, expired_date: expiredOn };
};

/**
 * GET /events/assets/status/:applicationNumber — the prosecution timeline.
 *
 * Filing, publication and grant dates come from whichever index holds them:
 * the publication index for a pending application, the grant index once it
 * issues, and the assignment corpus as a last resort.
 */
const assetStatus = async (applicationNumber) => {
  if (!applicationNumber) throw ApiError.badRequest('An application number is required');

  const [publication, grant] = await Promise.all([
    repository.publicationDates(applicationNumber),
    repository.grantDates(applicationNumber),
  ]);

  const fallback = grant ? null : await repository.documentDates(applicationNumber);
  const history = await repository.statusHistory(applicationNumber);

  return {
    filling_date: (grant && grant.filling_date)
      || (publication && publication.filling_date)
      || (fallback && fallback.filling_date)
      || null,
    pgpub_date: (publication && publication.pgpub_date)
      || (fallback && fallback.pgpub_date) || null,
    grant_doc_num: grant ? grant.grant_doc_num : null,
    grant_date: (grant && grant.grant_date) || (fallback && fallback.grant_date) || null,
    status: history,
  };
};

/** GET /events/all/assets/:category_type — assets in one event category. */
const assetsByCategory = async ({ categoryType, companies, customers, bankMode }) => {
  if (!companies.length) return { list: [], icons: {} };
  if (categoryType !== 'to_record') {
    throw ApiError.badRequest(`Unknown event category: ${categoryType}`);
  }

  const list = await repository.assetsToRecord({ companies, customers, bankMode });
  // Every unrecorded asset draws the same icon.
  const icon = icons.byId('13');
  return { list, icons: { 13: { icon1: icon, icon2: icon, icon3: icon } } };
};

const assetToRecordDetail = async (application) => {
  const row = await repository.assetToRecordDetail(application);
  if (!row) throw ApiError.notFound('No unrecorded asset with that number');
  return row;
};

/** GET /events/assets/transactions/:rfID — the assets on one transaction. */
const transactionAssets = async (rfId) => ({
  main: await repository.transactionAssets(rfId),
  icons: { 0: icons.byId('9'), 1: icons.byId('25') },
});

module.exports = {
  lifeSpanForSelection,
  lifeSpanForAssets,
  maintenanceAbandonment,
  yearlyAbandonment,
  eventsForAsset,
  assetStatus,
  assetsByCategory,
  assetToRecordDetail,
  transactionAssets,
  yearFloor,
};
