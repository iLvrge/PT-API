'use strict';

/**
 * Dashboard business logic: metric selection, party resolution, share links and
 * the one outbound PTAB lookup. No SQL here — it lives in dashboards.sql.js and
 * is executed by dashboards.repository.js.
 */

const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');
const { findLayout, checkTabs } = require('../../shared/layouts');
const shareCodes = require('../../shared/share-codes');
const repository = require('./dashboards.repository');

// The legacy connection.DEFAULT_YEAR: assets and transactions older than this
// are out of scope for every dashboard metric.
const yearFloor = () => new Date().getFullYear() - 24;

// The default metric behind "assets this company owns" (legacy getOwnedAssets
// with no explicit type).
const OWNED_ASSETS_TYPE = 30;

// Timeline tab -> the activity ids it covers.
const TIMELINE_ACTIVITIES = {
  1: [1, 6],
  2: [2, 7],
  3: [3, 4],
  4: [5, 12],
  5: [10],
  6: [9],
  7: [1, 6, 2, 7, 3, 4, 5, 12, 13, 11, 9],
};

const isBank = (formatType) =>
  typeof formatType === 'string' && formatType.toLowerCase() === 'bank';

/* ------------------------------------------------------------------ tiles */

const tiles = (companies) => repository.tiles(companies);

const collateral = ({ companies, parties }) => {
  if (!companies.length) return [];
  return repository.collateral({ companies, parties });
};

/* ---------------------------------------------------------------- parties */

/** POST /parties/assignor — who this company assigned assets to. */
const assignorParties = async ({ tenant, companies, search, type }) => {
  if (!companies.length) return [];
  const assignorName = await repository.tenantCompanyName(tenant, companies);
  if (!assignorName) return [];
  return repository.assignorParties({
    companies,
    assignorName,
    activityIds: type === 'license_in' ? [3, 4] : [2, 7],
    allAssets: search === 'all',
    year: yearFloor(),
  });
};

// The legacy name normalisers. Both regexes are deliberately non-global: they
// strip the FIRST run of whitespace / the first comma, period and bang only.
// Widening them would change which inventor names match.
const removeDoubleSpace = (value) => value.replace(/\s+/, ' ').trim();
const stripPunctuation = (value) =>
  value.replace(/,/, '').replace(/\./, '').replace(/!/, '').trim().toLowerCase();

/** Every ordering of an inventor's name parts that USPTO records use. */
const nameVariants = ({ given_name: given, middle_name: middle, family_name: family }) =>
  [
    family + middle + given,
    given + middle + family,
    family + given + middle,
    given + family + middle,
    family + given,
    given + family,
    family,
    given,
  ].map((name) => stripPunctuation(removeDoubleSpace(name)));

/** GET /parties/inventor/:inventorID — map an inventor to a counterparty id. */
const inventorParty = async (inventorId) => {
  if (!(inventorId > 0)) return {};
  const inventor = await repository.inventorNames(inventorId);
  if (!inventor || !(inventor.assignor_and_assignee_id > 0)) return {};
  const party = await repository.partyIdForNames(nameVariants(inventor));
  return party || {};
};

/**
 * POST /parties — counterparties on the acquisition / lending / licensing
 * activities, over whichever asset set the request implies.
 */
const parties = async ({ tenant, companies, search, layout, type, list, total, bankMode }) => {
  let layoutId = layout === undefined ? 32 : findLayout(layout);
  if (search === 'all') layoutId = 15;

  let assigneeName = await repository.tenantCompanyName(tenant, companies);
  const listMatchesTotal = layoutId === 15 && total > 0 && total === list.length;
  if (!assigneeName && !listMatchesTotal) return [];

  let activityIds = [1, 6];
  let assets = [];

  if (type === 'lenders' || type === 'license_out') {
    activityIds = type === 'lenders' ? [5, 12] : [3, 4];
    assets = await repository.ownedApplications({ companies, type: layoutId, bankMode });
  } else if (listMatchesTotal) {
    assets = list;
    const dominant = await repository.dominantCompanyForAssets(list);
    if (dominant) {
      assigneeName = await repository.tenantCompanyName(tenant, [dominant.representative_id]);
    }
  } else {
    assets = await repository.ownedApplications({ companies, type: layoutId, bankMode });
  }

  // The company name is projected into the result to mark "this is us", so
  // without it there is nothing to compare the counterparties against.
  if (!assets.length || !assigneeName) return [];

  return repository.parties({
    companies,
    assigneeName,
    activityIds,
    assets,
    inventors: type === 'filled',
    year: yearFloor(),
  });
};

/* ------------------------------------------------------- events & timeline */

/** POST /filed_assets_events — maintenance events on this company's filed patents. */
const filedAssetEvents = async (companies) => {
  if (!companies.length) return [];
  const applications = await repository.filedApplications(companies);
  if (!applications.length) return [];
  return repository.maintenanceEvents(applications);
};

/** POST /timeline — the company's recorded transactions for one timeline tab. */
const timeline = async ({ companies, type, parties: partyIds }) => {
  if (!companies.length) return [];
  const activityIds = TIMELINE_ACTIVITIES[type];
  if (!activityIds) return [];

  const recordedIds = await repository.recordedPartyIds(companies[0]);
  if (!recordedIds.length) return [];

  return repository.timeline({
    companies,
    activityIds,
    recordedIds,
    parties: partyIds,
    // Type 5 (employees) has no counterparty organisation to show a logo for.
    withLogos: type !== 5,
    year: yearFloor(),
  });
};

/* ------------------------------------------------------- counts & examples */

const counts = ({ companies, types, bankMode }) => repository.counts({ companies, types, bankMode });

const example = async ({ companies, types, parties: partyIds }) => {
  const row = await repository.example({ companies, types, parties: partyIds });
  return row || {};
};

/* ---------------------------------------------------------------- metrics */

/**
 * Ask the USPTO PTAB API how many of this company's proceedings cover assets we
 * track (metric 37). Network failures degrade to an empty tile rather than a
 * 5xx — the rest of the dashboard should still render.
 */
const ptabProceedings = async ({ company, ownedAssets }) => {
  const empty = {};
  if (!company || !ownedAssets.length) return empty;

  const base = `${env.external.ptabUrl}?patentOwnerName=${encodeURIComponent(`"${company}"`)}`;
  // An explicit controller rather than AbortSignal.timeout: the timer is
  // cleared as soon as the request settles, so a slow PTAB never holds the
  // event loop open past the response.
  const get = async (quantity) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.external.timeoutMs);
    try {
      const res = await fetch(`${base}&recordTotalQuantity=${quantity}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`PTAB responded ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const probe = await get(1);
    const totalRecords = Number(probe.recordTotalQuantity);
    if (!Number.isFinite(totalRecords) || totalRecords < 1) return empty;

    if (totalRecords === 1) {
      const first = (probe.results || [])[0];
      if (!first) return empty;
      const { appellantApplicationNumberText: appNo, appellantPatentNumber: patentNo } = first;
      if (!ownedAssets.includes(appNo) && !ownedAssets.includes(patentNo)) return empty;
      const hasPatent = patentNo !== undefined;
      return {
        number: hasPatent ? 1 : 0,
        other_number: !hasPatent && appNo !== undefined ? 1 : 0,
        patent: hasPatent ? patentNo : '',
        application: !hasPatent && appNo !== undefined ? appNo : '',
        rf_id: '',
        total: 1,
      };
    }

    const full = await get(totalRecords);
    const patents = [];
    const applications = [];
    (full.results || []).forEach((item) => {
      const { appellantApplicationNumberText: appNo, appellantPatentNumber: patentNo } = item;
      if (patentNo !== undefined && !patents.includes(patentNo) && ownedAssets.includes(patentNo)) {
        patents.push(patentNo);
      } else if (appNo !== undefined && !applications.includes(appNo) && ownedAssets.includes(appNo)) {
        applications.push(appNo);
      }
    });
    return {
      number: patents.length,
      other_number: applications.length,
      patent: patents[0] || '',
      application: applications[0] || '',
      rf_id: '',
      total: patents.length + applications.length,
    };
  } catch (err) {
    logger.warn('PTAB lookup failed', { company, error: err.message });
    return empty;
  }
};

/** POST / — one dashboard metric. */
const metric = async (input) => {
  const { type, companies, bankMode, bank, company } = input;

  // Metric 38 (top non-US family members) is computed over the assets this
  // company owns rather than over dashboard_items directly.
  const ownedAssets = type === 38
    ? await repository.ownedApplications({ companies, type: OWNED_ASSETS_TYPE, bankMode })
    : [];

  const result = await repository.metric({ ...input, ownedAssets, year: yearFloor() });
  if (result !== null) return result;

  // Metric 37 (PTAB) has no SQL branch — it is an outbound lookup.
  if (type === 37 && !bank && company) {
    const assets = await repository.ownedApplications({
      companies, type: OWNED_ASSETS_TYPE, bankMode,
    });
    return ptabProceedings({ company, ownedAssets: assets });
  }
  return {};
};

/** POST /temp — the same metrics recomputed live against the raw asset tables. */
const temp = async ({ hasList, type, bank, companies, parties: partyIds, tabs, customers, assignments }) => {
  if (!hasList) return {};

  let total = 0;
  let assets = [];
  let list = [];

  if (bank) {
    if (!companies.length) return {};
    ({ total, assets } = await repository.bankAssets({ type, companies, parties: partyIds }));
  } else {
    list = await repository.ownedAssetsForTemp({
      type, companies, tabs: checkTabs(tabs), customers, assignments, year: yearFloor(),
    });
    total = list.length;
  }

  const aggregate = await repository.tempAggregate({
    type, bank, companies, parties: partyIds, assets, list, total, year: yearFloor(),
  });
  return aggregate || {};
};

/* ------------------------------------------------------------------ share */

/** POST /share — a public link to this dashboard selection. */
const share = async ({ tenant, orgId, userId, selectedCompanies, tabs, customers, shareButton }) => {
  if (!selectedCompanies.length) throw ApiError.badRequest('selectedCompanies is required');

  const otherCompanies = await repository.countUnselectedCompanies(tenant, selectedCompanies);
  const code = await shareCodes.allocate();
  if (!code) throw ApiError.internal('Unable to allocate a share code');

  await repository.createShare({
    organisation_id: orgId,
    user_id: userId,
    type: 9,
    share_button: shareButton,
    transactions: JSON.stringify({ selectedCompanies, tabs, customers }),
    code,
    show_other_companies: Number(otherCompanies) > 0 ? 1 : 0,
  });

  const subdomain = String(shareButton) === '2' ? 'dashboard' : 'kpi';
  return `https://${subdomain}.${env.share.domain}/dashboard/${code}`;
};

module.exports = {
  tiles,
  collateral,
  assignorParties,
  inventorParty,
  parties,
  filedAssetEvents,
  timeline,
  counts,
  example,
  metric,
  temp,
  share,
  isBank,
  yearFloor,
  nameVariants,
  TIMELINE_ACTIVITIES,
};
