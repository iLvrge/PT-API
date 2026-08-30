'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./illustration.service');

const parseCompanies = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    throw ApiError.badRequest('companies must be a JSON array');
  }
};

const byReelFrame = asyncHandler(async (req, res) => {
  res.status(200).json(await service.forReelFrame(req.params.reelFrame));
});

const byApplication = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.forApplication({
      applicationNumber: req.params.applicationNumber,
      companies: parseCompanies(req.query.companies),
      bankMode: Number(req.auth.orgType) === 2,
    })
  );
});

const byTransaction = asyncHandler(async (req, res) => {
  res.status(200).json(await service.forRfId(String(req.params.rf_id).trim()));
});

module.exports = { byReelFrame, byApplication, byTransaction };
