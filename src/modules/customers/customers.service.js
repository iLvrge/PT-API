'use strict';

const repository = require('./customers.repository');
const timelineQ = require('./customers.timeline');
const { distance } = require('fastest-levenshtein');
const ApiError = require('../../utils/api-error');
const { findLayout, checkTabs, TABS, ASSIGNMENT_TABS, RECORD_LIMIT, OFFSET } = require('./customers.constants');

// Resolve the caller's company set: use the given ids, else all top-level ones.
const resolveCompanies = async (tenant, companies) => {
  if (Array.isArray(companies) && companies.length) return companies;
  return repository.companyRepresentativeIds(tenant);
};

// GET /asset_types — per-tab customer counts (uses req.orgId, as legacy did).
const assetTypeTabs = async (tenant, organisationId, companies) => {
  const ids = await resolveCompanies(tenant, companies);
  if (!ids.length) return [];
  return repository.assetTypeTabs(ids, organisationId);
};

// GET /asset_types/companies — customers across a set of tabs, paged.
// Legacy scoped these with organisation_id = 0 (shared partition); preserved.
const assetTypeCompanies = async (tenant, companies, tabs, limit, offset) => {
  const ids = await resolveCompanies(tenant, companies);
  const tabSet = Array.isArray(tabs) && tabs.length ? tabs : [...TABS];
  const lim = limit > 0 ? parseInt(limit, 10) : RECORD_LIMIT;
  const off = offset > 0 ? parseInt(offset, 10) : OFFSET;

  const total = await repository.assetTypeCompaniesCount(ids, tabSet, 0);
  if (!total) return { list: [], total_records: 0 };
  const list = await repository.assetTypeCompanies(ids, tabSet, 0, lim, off);
  return { list, total_records: total };
};

// GET /asset_types/:tab_id/companies — companies for one tab (cross-charset).
const assetTypeTabCompanies = async (companies, tabId, layout) => {
  const company = Array.isArray(companies) ? companies[0] : companies;
  const layoutId = findLayout(layout);
  const list = await repository.assetTypeTabCompanies(company, tabId, layoutId, 0);
  return { list, tab_id: tabId, total_records: list.length };
};

// GET /asset_types/assignments — reel/frames for companies+tabs+customers.
// Legacy required `customers`; without it the query errored into a 500 — here
// it is an explicit 400.
const assetTypeAssignments = async ({ companies, tabs, customers, layout }) => {
  if (!Array.isArray(customers) || customers.length === 0) {
    throw ApiError.badRequest('customers is required');
  }
  const tabSet = tabs.length ? checkTabs(tabs) : [...ASSIGNMENT_TABS];
  const list = await repository.assetTypeAssignments({
    companies,
    tabs: tabSet,
    customers,
    layout: findLayout(layout),
    organisationId: 0, // legacy shared partition
  });
  return { list, total_records: list.length };
};

// GET /asset_types/assignments/:rfID — assets on one reel/frame.
const assignmentAssets = async (rfId, layout) => {
  const list = rfId > 0 ? await repository.assignmentAssets(rfId, findLayout(layout), 0) : [];
  return { list, total_records: list.length };
};

// GET /asset_types/assets — distinct assets via tree_parties_collection, paged.
const assetTypeAssets = async (tenant, { companies, tabs, customers, assignments, limit, offset }) => {
  const ids = await resolveCompanies(tenant, companies);
  const tabSet = tabs.length ? checkTabs(tabs) : [];
  const filters = { tabs: tabSet, customers, assignments };
  const replacements = { companies: ids, organisationId: 0 };
  if (tabSet.length) replacements.tabs = tabSet;
  if (customers.length) replacements.customers = customers;
  if (assignments.length) replacements.assignments = assignments;

  const total = await repository.assetTypeAssetsCount(filters, replacements);
  if (!total) return { list: [], total_records: 0 };

  const lim = limit > 0 ? parseInt(limit, 10) : RECORD_LIMIT;
  const off = offset > 0 ? parseInt(offset, 10) : OFFSET;
  const list = await repository.assetTypeAssets(filters, replacements, lim, off);
  return { list, total_records: total };
};

/**
 * GET /customers/lawfirm — law firms grouped from dashboard_items; with rfID,
 * correspondents matching that reel/frame's firm, ranked by Levenshtein
 * distance to the firm's representative name (legacy behaviour). Fixes the
 * legacy bug where multiple companies were bound as one comma-joined string.
 */
const lawfirms = async ({ companies, rfId, orgType }) => {
  const bankMode = orgType === 2;

  if (rfId > 0) {
    const firm = await repository.lawfirmForRfId(rfId);
    if (firm) {
      const list = await repository.lawfirmCorrespondents({
        companies,
        organisationId: 0,
        representativeId: firm.representative_id > 0 ? firm.representative_id : undefined,
        cname: firm.cname,
      });
      if (firm.representative_id > 0 && firm.representative_name) {
        const seen = new Set();
        for (const item of list) {
          const name = String(item.lawfirm || '').replace(/,/g, ' ').replace(/\./g, ' ');
          const key = name.replace(/\s/g, '').trim();
          if (!seen.has(key)) {
            seen.add(key);
            item.distance = distance(firm.representative_name, name.trim());
          }
        }
      }
      return list;
    }
  }

  return repository.lawfirmGroups({ companies, organisationId: 0, bankMode });
};

const lenders = ({ companies, orgType }) =>
  repository.lenders({ companies, organisationId: 0, bankMode: orgType === 2 });

/**
 * GET /customers/portfolios — two modes, matching legacy:
 *  - with portfolio + tab_id: parties for that tab with nested collections
 *    (distinct rf_id + exec_dt) each carrying its documentid assets
 *  - otherwise: representative/tab grouping for the tenant's portfolios
 * Both return per-tab customer counts alongside.
 */
const portfolios = async (tenant, { tabId, portfolio, limit, offset }) => {
  const hasTabMode = portfolio.length > 0 && Number.isInteger(tabId) && tabId >= 0;

  if (hasTabMode) {
    const lim = limit > 0 ? parseInt(limit, 10) : 1000;
    const off = offset > 0 ? parseInt(offset, 10) : 0;

    const parties = await repository.portfolioParties({
      representativeIds: portfolio,
      organisationId: 0,
      tabId,
      limit: lim,
      offset: off,
    });

    const collections = await repository.portfolioCollections({
      partyIds: parties.map((p) => p.id),
      representativeIds: portfolio,
      organisationId: 0,
      tabId,
    });

    const assets = await repository.assetsForRfIds([...new Set(collections.map((c) => c.rf_id))]);
    const assetsByRf = new Map();
    for (const a of assets) {
      if (!assetsByRf.has(a.rf_id)) assetsByRf.set(a.rf_id, []);
      assetsByRf.get(a.rf_id).push({ application: a.application, patent: a.patent });
    }
    const collByParty = new Map();
    for (const c of collections) {
      if (!collByParty.has(c.assignor_and_assignee_id)) collByParty.set(c.assignor_and_assignee_id, []);
      collByParty.get(c.assignor_and_assignee_id).push({
        rf_id: c.rf_id,
        exec_dt: c.exec_dt,
        assets: assetsByRf.get(c.rf_id) || [],
      });
    }

    const result = parties.map((p) => ({ ...p, collections: collByParty.get(p.id) || [] }));
    const tabs = await repository.tabCustomerCounts(portfolio, 0, TABS);
    return { portfolios: result, tabs };
  }

  const ids = portfolio.length ? portfolio : await repository.companyRepresentativeIds(tenant);
  if (!ids.length) return { portfolios: [], tabs: [] };

  const [result, tabs] = await Promise.all([
    repository.portfolioRepresentativeTabs(ids, 0),
    repository.tabCustomerCounts(ids, 0, TABS),
  ]);
  return { portfolios: result, tabs };
};

// POST /customers/transactions/groupids — transactions with a running total.
const transactionsByGroupIds = async (groupIds) => {
  if (!groupIds.length) return { list: [], total_records: 0 };
  const list = await repository.transactionsByGroupIds(groupIds);
  return { list, total_records: list.length };
};

// GET /customers/transactions/address — stored procedure (CSV args by contract).
// The legacy layout id resolved from a param that never existed, so it is
// always the default 15; kept explicit here.
const transactionsAddress = ({ companies, tabs, customers }) =>
  repository
    .correctAddress({
      companiesCsv: companies.join(','),
      organisationId: 0,
      tabsCsv: (tabs.length ? checkTabs(tabs) : []).join(','),
      customersCsv: customers.join(','),
      layoutId: 15,
    })
    .then((list) => ({ list, total_records: list.length }));

// GET /customers/transactions/name — stored procedure (CSV args by contract).
const transactionsName = ({ companies, tabs, customers }) =>
  repository
    .correctNames({
      companiesCsv: companies.join(','),
      organisationId: 0,
      tabsCsv: (tabs.length ? checkTabs(tabs) : []).join(','),
      customersCsv: customers.join(','),
    })
    .then((list) => ({ list, total_records: list.length }));

/**
 * GET /customers/incorrectnames — assignee name variants for a company, ranked
 * by Levenshtein distance to the representative's original name. Duplicate
 * normalised names are merged, summing their asset counts (legacy algorithm).
 */
const incorrectNames = async (tenant, { companies, id, orgType }) => {
  if (!companies.length) return [];

  let representativeName = await repository.tenantRepresentativeName(tenant, companies);
  if (!representativeName) return [];

  const original = await repository.originalAssigneeName(representativeName);
  if (original) representativeName = original;

  const list = await repository.incorrectNamesList({
    organisationId: 0,
    companies,
    id: id > 0 ? id : 0,
    bankMode: orgType === 2,
  });

  const results = [];
  const seen = new Map(); // normalised name -> index in results
  for (const item of list) {
    const cleaned = String(item.name || '').replace(/,/g, ' ').replace(/\./g, ' ');
    const key = cleaned.replace(/\s/g, '').trim();
    if (!seen.has(key)) {
      item.distance = distance(representativeName, cleaned.trim());
      if (item.distance > 0) {
        seen.set(key, results.length);
        results.push(item);
      } else {
        seen.set(key, -1); // exact match: tracked but excluded, like legacy
      }
    } else {
      const idx = seen.get(key);
      if (idx >= 0) results[idx].count_assets += item.count_assets;
    }
  }
  return results;
};

// POST /customers/transactions/queues/address — proposed address corrections.
const queueAddress = async (tenant, { groupIds, newAddressId, companyIds }) => {
  if (!groupIds.length) return [];
  const address = await repository.tenantAddress(tenant, newAddressId);
  if (!address) return [];
  const newAddress = [
    address.street_address, address.suite, address.city,
    address.state, address.zip_code, address.country,
  ].map((v) => v || '').join(' ').replace(/\s+/g, ' ').trim();
  return repository.queueAddressList({
    newAddressId,
    newAddress,
    companyIds,
    rfIds: groupIds,
    organisationId: 0,
  });
};

// POST /customers/transactions/queues/name — proposed name corrections.
const queueName = async (tenant, { groupIds, newName, companyIds }) => {
  if (!groupIds.length) return [];
  let name = newName;
  if (name === undefined || name === 'undefined') {
    name = await repository.tenantRepresentativeNameById(tenant, companyIds);
  }
  if (!name || name === 'undefined') return [];
  return repository.queueNameList({
    newName: String(name).toUpperCase(),
    companyIds,
    rfIds: groupIds,
    organisationId: 0,
  });
};

// GET /customers/:layout/parties — two branches by layout, matching legacy.
const layoutParties = async ({ layout, companies, tabs, customerType, orgType }) => {
  const layoutId = findLayout(layout);
  const bankMode = orgType === 2;
  const tabSet = tabs.length ? checkTabs(tabs) : [];

  const list =
    layoutId !== 15
      ? await repository.partiesByLayout({ companies, layoutId, organisationId: 0, bankMode })
      : await repository.partiesDefault({
          companies,
          tabs: tabSet,
          customerType,
          layoutId,
          organisationId: 0,
        });
  return { list, total_records: list.length };
};

// GET /customers/:layout/activites — stored procedure (CSV args by contract).
const layoutActivities = ({ layout, companies }) =>
  repository.layoutActivities({
    companiesCsv: companies.join(','),
    organisationId: 0,
    layoutId: findLayout(layout),
  });

// GET /customers/:rf_id/assets — assets on one reel/frame.
// NOTE: unreachable in legacy (shadowed by /:layout/assets, defined earlier);
// registered after it here too so precedence is preserved once that lands.
const rfIdAssets = async (orgId, rfId) => {
  if (!(await repository.organisationExists(orgId))) return [];
  if (!(rfId > 0)) return [];
  return repository.rfIdAssets(rfId);
};

/**
 * Build the per-year asset-count timeline from filing dates. Pure port of the
 * legacy findAssetsTimeSpan/findMaxMin pair: each application counts for the
 * 20 years from its filing year INCLUSIVE of the end year, and the final
 * aggregation runs from the minimum to the maximum year EXCLUSIVE (legacy
 * boundary behaviour, preserved).
 */
const buildLifeSpan = (rows) => {
  const seen = new Set();
  const counts = new Map(); // year -> count
  let min = Infinity;
  let max = -Infinity;

  for (const row of rows) {
    if (seen.has(row.application)) continue;
    seen.add(row.application);
    const start = new Date(row.appno_date).getFullYear();
    if (!Number.isFinite(start)) continue;
    const end = start + 20;
    for (let year = start; year <= end; year++) {
      counts.set(year, (counts.get(year) || 0) + 1);
      if (year < min) min = year;
      if (year > max) max = year;
    }
  }

  const out = [];
  for (let year = min; year < max; year++) {
    const count = counts.get(year);
    if (count) out.push({ year, count });
  }
  return out;
};

// GET /customers/events — asset life-span timeline for the caller's portfolios.
const events = async (tenant, orgId, { tabId, portfolio }) => {
  const ids = portfolio.length ? portfolio : await repository.companyRepresentativeIds(tenant);
  if (!ids.length) return [];
  const rows = await repository.assetLifeSpanRows({
    representativeIds: ids,
    tabId: tabId > 0 ? tabId : 0,
    customerId: 0,
    rfId: 0,
    organisationId: orgId,
  });
  return buildLifeSpan(rows);
};

/**
 * GET /customers/timeline — the six-branch transaction timeline, selected by
 * layout. Branch behaviour transcribed from legacy (with its ANDdd-typo and
 * duplicate-condition bugs fixed); the logo join wraps the branch result for
 * the layout names legacy singled out. groups is always [] (legacy commented
 * its group query out but kept the response shape).
 */
const timeline = async ({ layout, companies, tabs, customers, rfIds, exclude, start, end, orgType }) => {
  const layoutId = findLayout(layout);
  const bankMode = orgType === 2;
  const tabSet = tabs.length ? checkTabs(tabs) : [];
  const base = { organisationId: 0, bankMode, start, end };

  let built = null;
  if (layoutId !== 15) {
    if (layoutId === 34) {
      const assets = await timelineQ.collateralizedAssets({ companies, organisationId: 0, layoutId, bankMode });
      if (assets.length) built = timelineQ.branchCollateralized({ ...base, companies, assets });
    } else if (layoutId === 40) {
      const firm = rfIds.length ? await timelineQ.lawfirmFilterFor(rfIds[0]) : null;
      built = timelineQ.branchLawfirm({ ...base, companies, layoutId, firm });
    } else if (layoutId === 39) {
      built = timelineQ.branchInventors({ ...base, companies, customers, layoutId });
    } else if (layoutId === 41) {
      built = timelineQ.branchLenders({ ...base, companies, layoutId });
    } else {
      built = timelineQ.branchGenericLayout({ ...base, companies, layoutId });
    }
  } else {
    built = timelineQ.branchDefault({ ...base, companies, tabs: tabSet, customers, rfIds, exclude });
  }

  if (!built) return { list: [], groups: [] };
  if (timelineQ.LOGO_LAYOUTS.has(layout)) {
    built = { sql: timelineQ.wrapWithLogos(built.sql), repl: built.repl };
  }
  const list = await timelineQ.run(built);
  return { list, groups: [] };
};

module.exports = {
  timeline,
  buildLifeSpan,
  events,
  layoutParties,
  layoutActivities,
  rfIdAssets,
  assetTypeTabs,
  assetTypeCompanies,
  assetTypeTabCompanies,
  assetTypeAssignments,
  assignmentAssets,
  assetTypeAssets,
  lawfirms,
  lenders,
  portfolios,
  transactionsByGroupIds,
  transactionsAddress,
  transactionsName,
  incorrectNames,
  queueAddress,
  queueName,
};
