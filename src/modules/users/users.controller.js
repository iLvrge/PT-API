'use strict';

/**
 * HTTP layer for users — translates requests to service calls and shapes
 * responses. No business logic and no data access live here.
 */

const asyncHandler = require('../../utils/async-handler');
const service = require('./users.service');

const list = asyncHandler(async (req, res) => {
  const users = await service.list(req.params.id);
  res.status(200).json(users);
});

const create = asyncHandler(async (req, res) => {
  const user = await service.create(req.params.id, req.body);
  res.status(201).json(user);
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.params.userId);
  res.status(200).json(result);
});

module.exports = { list, create, remove };
