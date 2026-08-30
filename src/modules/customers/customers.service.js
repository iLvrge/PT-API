'use strict';

const repository = require('./customers.repository');
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

module.exports = {
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
