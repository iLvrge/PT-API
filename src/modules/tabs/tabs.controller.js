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
  res.status(200).json(await service.companies(req.tenant, req.auth.orgId, Number(req.params.tab_id)));
});

const companyCustomers = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.companyCustomers(
      req.auth.orgId, Number(req.params.tab_id), Number(req.params.company_id),
      req.query.limit, req.query.offset
    )
  );
});

const customers = asyncHandler(async (req, res) => {
  const companyIds = parseIds(req.query.companiesIds, 'companiesIds');
  if (!companyIds.length) throw ApiError.badRequest('companiesIds is required');
  res.status(200).json(
    await service.customers(req.auth.orgId, Number(req.params.tab_id), companyIds, req.query.limit, req.query.offset)
  );
});

const customerTransactions = asyncHandler(async (req, res) => {
  const representativeIds = parseIds(req.params.company_id, 'companyID');
  res.status(200).json(
    await service.customerTransactions(
      req.auth.orgId, Number(req.params.tab_id), representativeIds,
      Number(req.params.customer_id), req.query.limit, req.query.offset
    )
  );
});

const transactionAssets = asyncHandler(async (req, res) => {
  res.status(200).json(await service.transactionAssets(Number(req.params.rf_id), req.query.limit, req.query.offset));
});

module.exports = { companies, companyCustomers, customers, customerTransactions, transactionAssets };
