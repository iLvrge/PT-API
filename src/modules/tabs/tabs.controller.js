'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./tabs.service');

const parseIds = (raw, label) => {
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    throw ApiError.badRequest(`${label} must be JSON`);
  }
};

const companies = asyncHandler(async (req, res) => {
  res.status(200).json(await service.companies(req.tenant, req.auth.orgId, Number(req.params.tabID)));
});

const companyCustomers = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.companyCustomers(
      req.auth.orgId, Number(req.params.tabID), Number(req.params.companyID),
      req.query.limit, req.query.offset
    )
  );
});

const customers = asyncHandler(async (req, res) => {
  const companyIds = parseIds(req.query.companiesIds, 'companiesIds');
  if (!companyIds.length) throw ApiError.badRequest('companiesIds is required');
  res.status(200).json(
    await service.customers(req.auth.orgId, Number(req.params.tabID), companyIds, req.query.limit, req.query.offset)
  );
});

const customerTransactions = asyncHandler(async (req, res) => {
  const representativeIds = parseIds(req.params.companyID, 'companyID');
  res.status(200).json(
    await service.customerTransactions(
      req.auth.orgId, Number(req.params.tabID), representativeIds,
      Number(req.params.customerID), req.query.limit, req.query.offset
    )
  );
});

const transactionAssets = asyncHandler(async (req, res) => {
  res.status(200).json(await service.transactionAssets(Number(req.params.rfID), req.query.limit, req.query.offset));
});

module.exports = { companies, companyCustomers, customers, customerTransactions, transactionAssets };
