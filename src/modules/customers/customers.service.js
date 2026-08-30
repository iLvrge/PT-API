'use strict';

const repository = require('./customers.repository');
const { findLayout, TABS, RECORD_LIMIT, OFFSET } = require('./customers.constants');

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

module.exports = { assetTypeTabs, assetTypeCompanies, assetTypeTabCompanies };
