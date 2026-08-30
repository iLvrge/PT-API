'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./telephone.service');

const parseCompanies = (raw) => {
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    throw ApiError.badRequest('companies must be a JSON array of representative ids');
  }
};

const list = asyncHandler(async (req, res) => {
  const representativeIds = parseCompanies(req.query.companies);
  res.status(200).json(await service.list(req.tenant, representativeIds));
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.tenant, req.body));
});

const remove = asyncHandler(async (req, res) => {
  res.status(200).json(await service.remove(req.tenant, req.params.telephoneId));
});

module.exports = { list, create, remove };
