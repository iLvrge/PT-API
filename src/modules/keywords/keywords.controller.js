'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./keywords.service');

const list = asyncHandler(async (req, res) => {
  res.status(200).json(await service.list());
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.body.keyword));
});

const update = asyncHandler(async (req, res) => {
  res.status(200).json(await service.update(req.params.keyword_id, req.body.keyword));
});

const remove = asyncHandler(async (req, res) => {
  res.status(200).json(await service.remove(req.params.keyword_id));
});

module.exports = { list, create, update, remove };
