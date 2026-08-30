'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./collections.service');

const parseCompanies = (raw) => {
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    throw ApiError.badRequest('companies must be a JSON array of ids');
  }
};

const list = asyncHandler(async (req, res) => {
  res.status(200).json(await service.list(req.tenant));
});

const create = asyncHandler(async (req, res) => {
  const companies = parseCompanies(req.body.companies);
  const result = await service.create(req.tenant, req.auth.userId, {
    collection_name: req.body.collection_name,
    companies,
  });
  res.status(201).json(result);
});

const update = asyncHandler(async (req, res) => {
  const companies = parseCompanies(req.body.companies);
  const result = await service.update(req.tenant, req.params.collectionId, {
    collection_name: req.body.collection_name,
    companies,
  });
  res.status(200).json(result);
});

const remove = asyncHandler(async (req, res) => {
  res.status(200).json(await service.remove(req.tenant, req.params.collectionId));
});

module.exports = { list, create, update, remove };
