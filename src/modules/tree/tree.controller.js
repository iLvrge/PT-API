'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./tree.service');

const portfolio = asyncHandler(async (req, res) => {
  let representativeIds;
  try {
    representativeIds = JSON.parse(req.query.portfolio || '[]');
  } catch (_err) {
    throw ApiError.badRequest('portfolio must be a JSON array');
  }
  if (!Array.isArray(representativeIds)) throw ApiError.badRequest('portfolio must be a JSON array');

  res.status(200).json(await service.portfolio(req.auth.orgId, representativeIds));
});

module.exports = { portfolio };
