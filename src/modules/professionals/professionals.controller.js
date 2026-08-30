'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./professionals.service');

const list = asyncHandler(async (req, res) => {
  res.status(200).json(await service.list(req.tenant));
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.tenant, req.body));
});

const update = asyncHandler(async (req, res) => {
  res.status(200).json(await service.update(req.tenant, req.params.professionalId, req.body));
});

const remove = asyncHandler(async (req, res) => {
  res.status(200).json(await service.remove(req.tenant, req.params.professionalId));
});

module.exports = { list, create, update, remove };
