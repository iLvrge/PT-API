'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./customers.service');

const parseArray = (raw, label) => {
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    throw ApiError.badRequest(`${label} must be a JSON array`);
  }
};

const assetTypeTabs = asyncHandler(async (req, res) => {
  const companies = parseArray(req.query.companies, 'companies');
  res.status(200).json(await service.assetTypeTabs(req.tenant, req.auth.orgId, companies));
});

const assetTypeTabCompanies = asyncHandler(async (req, res) => {
  const companies = parseArray(req.query.companies, 'companies');
  res.status(200).json(await service.assetTypeTabCompanies(companies, req.params.tab_id, req.query.layout));
});

const assetTypeCompanies = asyncHandler(async (req, res) => {
  const companies = parseArray(req.query.companies, 'companies');
  const tabs = parseArray(req.query.tabs, 'tabs');
  res.status(200).json(await service.assetTypeCompanies(req.tenant, companies, tabs, req.query.limit, req.query.offset));
});

const assetTypeAssignments = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.assetTypeAssignments({
      companies: parseArray(req.query.companies, 'companies'),
      tabs: parseArray(req.query.tabs, 'tabs'),
      customers: parseArray(req.query.customers, 'customers'),
      layout: req.query.layout,
    })
  );
});

const assignmentAssets = asyncHandler(async (req, res) => {
  res.status(200).json(await service.assignmentAssets(req.params.rfID, req.query.layout));
});

const assetTypeAssets = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.assetTypeAssets(req.tenant, {
      companies: parseArray(req.query.companies, 'companies'),
      tabs: parseArray(req.query.tabs, 'tabs'),
      customers: parseArray(req.query.customers, 'customers'),
      assignments: parseArray(req.query.assignments, 'assignments'),
      limit: req.query.limit,
      offset: req.query.offset,
    })
  );
});

const lawfirms = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.lawfirms({
      companies: parseArray(req.query.companies, 'companies'),
      rfId: Number(req.query.rfID) || 0,
      orgType: req.auth.orgType,
    })
  );
});

const lenders = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.lenders({
      companies: parseArray(req.query.companies, 'companies'),
      orgType: req.auth.orgType,
    })
  );
});

const portfolios = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.portfolios(req.tenant, {
      tabId: req.query.tab_id !== undefined ? Number(req.query.tab_id) : undefined,
      portfolio: parseArray(req.query.portfolio, 'portfolio'),
      limit: req.query.limit,
      offset: req.query.offset,
    })
  );
});

const transactionsByGroupIds = asyncHandler(async (req, res) => {
  res.status(200).json(await service.transactionsByGroupIds(parseArray(req.body.group_ids, 'group_ids')));
});

const transactionsAddress = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.transactionsAddress({
      companies: parseArray(req.query.companies, 'companies'),
      tabs: parseArray(req.query.tabs, 'tabs'),
      customers: parseArray(req.query.customers, 'customers'),
    })
  );
});

const transactionsName = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.transactionsName({
      companies: parseArray(req.query.companies, 'companies'),
      tabs: parseArray(req.query.tabs, 'tabs'),
      customers: parseArray(req.query.customers, 'customers'),
    })
  );
});

const incorrectNames = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.incorrectNames(req.tenant, {
      companies: parseArray(req.query.companies, 'companies'),
      id: Number(req.query.id) || 0,
      orgType: req.auth.orgType,
    })
  );
});

const queueAddress = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.queueAddress(req.tenant, {
      groupIds: parseArray(req.body.group_ids, 'group_ids'),
      newAddressId: Number(req.body.new_address) || 0,
      companyIds: parseArray(req.body.company_ids, 'company_ids'),
    })
  );
});

const queueName = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.queueName(req.tenant, {
      groupIds: parseArray(req.body.group_ids, 'group_ids'),
      newName: req.body.new_name,
      companyIds: parseArray(req.body.company_ids, 'company_ids'),
    })
  );
});

const layoutParties = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.layoutParties({
      layout: req.params.layout,
      companies: parseArray(req.query.companies, 'companies'),
      tabs: parseArray(req.query.tabs, 'tabs'),
      customerType: Number(req.query.t) || 0,
      orgType: req.auth.orgType,
    })
  );
});

const layoutActivities = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.layoutActivities({
      layout: req.params.layout,
      companies: parseArray(req.query.companies, 'companies'),
    })
  );
});

const rfIdAssets = asyncHandler(async (req, res) => {
  res.status(200).json(await service.rfIdAssets(req.auth.orgId, Number(req.params.rf_id)));
});

const events = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.events(req.tenant, req.auth.orgId, {
      tabId: Number(req.query.tab_id) || 0,
      portfolio: parseArray(req.query.portfolio, 'portfolio'),
    })
  );
});

const timeline = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.timeline({
      layout: req.query.layout,
      companies: parseArray(req.query.companies, 'companies'),
      tabs: parseArray(req.query.tabs, 'tabs'),
      customers: parseArray(req.query.customers, 'customers'),
      rfIds: parseArray(req.query.rf_ids, 'rf_ids'),
      exclude: req.query.exclude,
      start: req.query.start,
      end: req.query.end,
      orgType: req.auth.orgType,
    })
  );
});

const timelineFillingAssets = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.timelineFillingAssets(req.tenant, {
      companies: parseArray(req.query.companies, 'companies'),
      rfIds: parseArray(req.query.rf_ids, 'rf_ids'),
      start: req.query.start,
      end: req.query.end,
      orgType: req.auth.orgType,
    })
  );
});

const timelineSecurity = asyncHandler(async (req, res) => {
  res.status(200).json(await service.timelineSecurity());
});

// Shared parser for the analytics POST bodies (legacy form-post fields).
const parseAnalyticsBody = (req) => ({
  list: parseArray(req.body.list, 'list'),
  total: req.body.total,
  type: req.body.type,
  companies: parseArray(req.body.selectedCompanies, 'selectedCompanies'),
  tabs: parseArray(req.body.tabs, 'tabs'),
  customers: parseArray(req.body.customers, 'customers'),
  assignments: parseArray(req.body.assignments, 'assignments'),
  dataType: req.body.data_type !== undefined ? Number(req.body.data_type) : undefined,
  otherMode: req.body.other_mode,
  sale: req.body.sale,
  license: req.body.license,
  lawfirm: Number(req.body.lawfirm) || 0,
  check: req.body.check !== undefined ? Number(req.body.check) : undefined,
});

const assetAgents = asyncHandler(async (req, res) => {
  res.status(200).json(await service.assetAgents(req.tenant, parseAnalyticsBody(req), req.auth));
});

const assetFamily = asyncHandler(async (req, res) => {
  res.status(200).json(await service.assetFamily(req.tenant, parseAnalyticsBody(req), req.auth));
});

const inventorLocations = asyncHandler(async (req, res) => {
  res.status(200).json(await service.inventorLocations(req.tenant, parseAnalyticsBody(req), req.auth));
});

module.exports = {
  assetAgents,
  assetFamily,
  inventorLocations,
  timelineFillingAssets,
  timelineSecurity,
  timeline,
  events,
  layoutParties,
  layoutActivities,
  rfIdAssets,
  assetTypeTabs,
  assetTypeTabCompanies,
  assetTypeCompanies,
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
