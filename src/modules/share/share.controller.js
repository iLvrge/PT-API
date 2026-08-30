'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./share.service');

const parseJson = (raw, label, fallback) => {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    throw ApiError.badRequest(`${label} must be valid JSON`);
  }
};

const create = asyncHandler(async (req, res) => {
  const url = await service.create({
    orgId: req.auth.orgId,
    userId: req.auth.userId,
    type: Number(req.body.type) || 0,
    assets: parseJson(req.body.assets, 'assets', []),
    transactions: parseJson(req.body.transactions, 'transactions', []),
  });
  res.status(200).type('text/plain').send(url);
});

const shareOneAsset = asyncHandler(async (req, res) => {
  const url = await service.shareOneAsset({ code: req.params.code, asset: req.params.asset });
  res.status(200).type('text/plain').send(url);
});

const assets = asyncHandler(async (req, res) => {
  res.status(200).json(await service.assets(req.params.code, Number(req.params.type)));
});

const assetIllustration = asyncHandler(async (req, res) => {
  const body = await service.assetIllustration({ code: req.params.code, asset: req.params.asset });
  res.status(200).type('application/json').send(body);
});

const firstIllustration = asyncHandler(async (req, res) => {
  res.status(200).type('application/json').send(await service.firstIllustration(req.params.code));
});

const timeline = asyncHandler(async (req, res) => {
  res.status(200).json(await service.timeline(req.params.code));
});

const dashboard = asyncHandler(async (req, res) => {
  res.status(200).json(await service.dashboard(req.params.code));
});

module.exports = { create, shareOneAsset, assets, assetIllustration, firstIllustration, timeline, dashboard };
