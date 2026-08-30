'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./activities.service');

const list = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listOrCount(req.tenant, { type: req.query.type, count: req.query.count }));
});

const byTypeOption = asyncHandler(async (req, res) => {
  res.status(200).json(await service.byTypeOption(req.tenant, req.params.type, req.params.option));
});

const comments = asyncHandler(async (req, res) => {
  res.status(200).json(await service.commentsForSubject(req.tenant, req.params.subject_type, req.params.subject));
});

const getById = asyncHandler(async (req, res) => {
  res.status(200).json(await service.getById(req.tenant, req.params.id));
});

const create = asyncHandler(async () => {
  // The legacy POST performs file uploads, share-link creation and several
  // cross-table lookups. Those depend on the upload service and share module
  // not yet ported to v2 — declared explicitly rather than half-implemented.
  throw new ApiError(501, 'Creating activities is not yet available in this API version');
});

const update = asyncHandler(async (req, res) => {
  res.status(200).json(await service.setComplete(req.tenant, req.params.id, req.body.complete));
});

module.exports = { list, byTypeOption, comments, getById, create, update };
