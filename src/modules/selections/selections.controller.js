'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./selections.service');

const parseIds = (raw) => {
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    throw ApiError.badRequest('representative_id must be a JSON array');
  }
};

const getCompanies = asyncHandler(async (req, res) => {
  res.status(200).json(await service.getCompanies(req.auth.userId, req.auth.orgId));
});

const setCompanies = asyncHandler(async (req, res) => {
  const ids = parseIds(req.body.representative_id);
  res.status(200).json(await service.setCompanies(req.auth.userId, req.auth.orgId, ids));
});

const getActivity = asyncHandler(async (req, res) => {
  res.status(200).json(await service.getActivity(req.auth.userId, req.auth.orgId));
});

const setActivity = asyncHandler(async (req, res) => {
  res.status(200).json(await service.setActivity(req.auth.userId, req.auth.orgId, req.body.activity_id));
});

const clearActivity = asyncHandler(async (req, res) => {
  await service.clearActivity(req.auth.userId, req.auth.orgId, req.body.activity_id);
  res.status(200).send('Delete selection');
});

module.exports = { getCompanies, setCompanies, getActivity, setActivity, clearActivity };
