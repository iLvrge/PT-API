'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./client-users.service');

const parseIds = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n)) : [];
  } catch (_err) {
    throw ApiError.badRequest('list must be a JSON array of user ids');
  }
};

const list = asyncHandler(async (req, res) => {
  res.status(200).json(await service.list(req.tenant));
});

const create = asyncHandler(async (req, res) => {
  const user = await service.create(req.tenant, req.auth.userId, req.auth.orgId, req.body);
  res.status(201).json(user);
});

const update = asyncHandler(async (req, res) => {
  await service.update(req.tenant, req.auth.userId, req.auth.orgId, req.params.userId, req.body);
  res.status(200).send('Updated successfully');
});

const removeMany = asyncHandler(async (req, res) => {
  const ids = parseIds(req.query.list);
  if (!ids.length) throw ApiError.badRequest('No valid user IDs provided.');
  await service.deleteUsers(req.tenant, req.auth.userId, ids);
  res.status(200).send('Users deleted successfully.');
});

const removeOne = asyncHandler(async (req, res) => {
  if (Number(req.params.userId) === req.auth.userId) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  await service.deleteUsers(req.tenant, req.auth.userId, [req.params.userId]);
  res.status(200).send('User deleted.');
});

const invite = asyncHandler(async () => {
  // Slack workspace invitations require the Slack integration module, which is
  // not yet ported to v2. Declared explicitly rather than silently no-oping.
  throw new ApiError(501, 'Slack invitations are not yet available in this API version');
});

module.exports = { list, create, update, removeMany, removeOne, invite };
