'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./company.service');

const parseIds = (raw, label) => {
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    throw ApiError.badRequest(`${label} must be a JSON array`);
  }
};

const addRequest = asyncHandler(async (req, res) => {
  res.status(200).json(await service.addRequest(req.auth.orgId, req.body.name));
});
const listRequests = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listRequests(req.auth.orgId));
});
const companiesWithChildren = asyncHandler(async (req, res) => {
  res.status(200).json(await service.companiesWithChildren(req.tenant));
});
const updateCompany = asyncHandler(async (req, res) => {
  res.status(200).json(await service.updateCompany(req.tenant, Number(req.params.companyID), req.body));
});
const summary = asyncHandler(async (req, res) => {
  res.status(200).json(await service.summary(req.tenant, req.auth.orgId));
});
const companyChildren = asyncHandler(async (req, res) => {
  res.status(200).json(await service.companyChildren(req.tenant, Number(req.params.companyID)));
});
const companyUsers = asyncHandler(async () => {
  // Requires the Slack workspace integration, not yet ported to v2.
  throw new ApiError(501, 'Company Slack user lists are not yet available in this API version');
});
const companyList = asyncHandler(async (req, res) => {
  const auth = { ...req.auth, showOtherCompanies: req.auth.showOtherCompanies, shareCode: req.auth.shareCode };
  res.status(200).json(await service.companyList(req.tenant, auth, req.query));
});
const maintainenceAssets = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.maintainenceAssets(req.auth.orgId, req.auth.orgType, parseIds(req.query.representative_id, 'representative_id'))
  );
});
const lawfirmMappings = asyncHandler(async (req, res) => {
  res.status(200).json(await service.lawfirmMappings(req.tenant, parseIds(req.query.companies, 'companies')));
});
const addLawfirmMappings = asyncHandler(async (req, res) => {
  if (req.body.companies == null || req.body.lawfirms === undefined) throw ApiError.badRequest('Invalid inputs');
  res.status(200).json(
    await service.addLawfirmMappings(req.tenant, parseIds(req.body.companies, 'companies'), parseIds(req.body.lawfirms, 'lawfirms'))
  );
});
const removeLawfirmMapping = asyncHandler(async (req, res) => {
  res.status(200).json(await service.removeLawfirmMapping(req.tenant, Number(req.params.companyLawfirmId)));
});
const search = asyncHandler(async (req, res) => {
  res.status(200).json(await service.search(req.params.searchName));
});
const addGroup = asyncHandler(async (req, res) => {
  res.status(200).json(await service.addGroup(req.tenant, req.body.group_name));
});

module.exports = {
  addRequest,
  listRequests,
  companiesWithChildren,
  updateCompany,
  summary,
  companyChildren,
  companyUsers,
  companyList,
  maintainenceAssets,
  lawfirmMappings,
  addLawfirmMappings,
  removeLawfirmMapping,
  search,
  addGroup,
};
