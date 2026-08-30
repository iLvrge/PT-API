'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./transactions.service');

const parseCompanies = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    throw ApiError.badRequest('companies must be a JSON array');
  }
};

const counters = asyncHandler(async (req, res) => {
  res.status(200).json(await service.counters(req.auth.orgId, parseCompanies(req.query.companies)));
});

const detail = asyncHandler(async (req, res) => {
  res.status(200).json(await service.detail(Number(req.params.transactionId)));
});

module.exports = { counters, detail };
