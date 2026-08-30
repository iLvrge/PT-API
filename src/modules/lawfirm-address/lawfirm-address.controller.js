'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./lawfirm-address.service');

const listAll = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listAll(req.tenant));
});

const listByLawfirm = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listByLawfirm(req.tenant, req.params.lawfirmId));
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

module.exports = { listAll, listByLawfirm, create, update, remove };
