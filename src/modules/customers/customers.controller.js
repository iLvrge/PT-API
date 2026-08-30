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

module.exports = {
  assetTypeTabs,
  assetTypeTabCompanies,
  assetTypeCompanies,
  assetTypeAssignments,
  assignmentAssets,
  assetTypeAssets,
};
