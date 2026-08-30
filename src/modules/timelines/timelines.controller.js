'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./timelines.service');
const { DEFAULT_LIMIT } = require('./timelines.constants');

const parseList = (raw, label) => {
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    throw ApiError.badRequest(`${label} must be a JSON array`);
  }
};

const list = asyncHandler(async (req, res) => {
  const rawLimit = req.query.limit;
  const limit = rawLimit === undefined || rawLimit === null || rawLimit === ''
    ? null
    : (Number(rawLimit) > 0 ? Number(rawLimit) : DEFAULT_LIMIT);
  const offset = Number(req.query.offset) > 0 ? Number(req.query.offset) : 0;

  res.status(200).json(
    await service.list({
      orgId: req.auth.orgId,
      from: req.query.from,
      to: req.query.to,
      companies: parseList(req.query.companies, 'companies'),
      tabs: parseList(req.query.tabs, 'tabs'),
      parties: parseList(req.query.customers, 'customers'),
      limit,
      offset,
    })
  );
});

const item = asyncHandler(async (req, res) => {
  res.status(200).json(await service.item(String(req.params.rfId).trim()));
});

const standalone = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.standalone({ orgId: req.auth.orgId, groupId: Number(req.params.groupId) })
  );
});

const standaloneFiltered = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.standaloneFiltered({
      orgId: req.auth.orgId,
      groupId: Number(req.params.groupId),
      from: req.params.startDate,
      to: req.params.endDate,
      scrollRight: req.params.scroll === 'right',
    })
  );
});

const searchFiltered = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.searchFiltered({
      orgId: req.auth.orgId,
      groupId: Number(req.params.groupId),
      from: req.params.startDate,
      to: req.params.endDate,
      // This endpoint encodes the scroll direction as 1 (right) / 0 (left).
      scrollRight: String(req.params.scroll) === '1',
    })
  );
});

const byTab = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.byTab({ orgId: req.auth.orgId, tab: Number(req.params.groupId) })
  );
});

const drillDown = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.drillDown({
      tenant: req.tenant,
      orgId: req.auth.orgId,
      organisation: req.params.organisation,
      name: req.params.name,
      depth: Number(req.params.depth) || 0,
      groupId: Number(req.params.groupId),
    })
  );
});

module.exports = { list, item, standalone, standaloneFiltered, searchFiltered, byTab, drillDown };
