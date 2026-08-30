'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./address.service');

const parseCompanies = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    throw ApiError.badRequest('companies must be a JSON array of representative ids');
  }
};

const list = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listGrouped(req.tenant, parseCompanies(req.query.companies)));
});

const listCompanies = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listFlat(req.tenant, parseCompanies(req.query.companies)));
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.tenant, req.body));
});

const update = asyncHandler(async (req, res) => {
  res.status(200).json(await service.update(req.tenant, req.params.addressId, req.body));
});

const remove = asyncHandler(async (req, res) => {
  res.status(200).json(await service.remove(req.tenant, req.params.addressId));
});

module.exports = { list, listCompanies, create, update, remove };
