'use strict';

const repository = require('./customers.repository');
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

module.exports = {
  assetTypeTabs,
  assetTypeCompanies,
  assetTypeTabCompanies,
  assetTypeAssignments,
  assignmentAssets,
  assetTypeAssets,
};
