'use strict';

/**
 * Dashboard HTTP layer: parse and normalise the request, delegate to the
 * service, send the response. No SQL and no branching business rules here.
 */

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./dashboards.service');

/**
 * The dashboard client sends arrays as JSON strings. Parse once, reject
 * malformed input with 400 instead of letting JSON.parse throw a 500.
 */
const parseList = (raw, label) => {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null) return [];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    throw ApiError.badRequest(`${label} must be a JSON array`);
  }
};

const isBankOrg = (req) => Number(req.auth.orgType) === 2;

const tiles = asyncHandler(async (req, res) => {
  const companies = parseList(req.query.companies, 'companies');
  // Without a company filter this aggregates every row in the shared partition
  // — about 8 million — and never returns inside a request timeout.
  if (!companies.length) throw ApiError.badRequest('companies is required and must not be empty');
  res.status(200).json(await service.tiles(companies));
});

const collateral = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.collateral({
      companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
      parties: parseList(req.body.assignor_id, 'assignor_id'),
    })
  );
});

const assignorParties = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.assignorParties({
      tenant: req.tenant,
      companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
      search: req.body.search,
      type: req.body.type,
    })
  );
});

const inventorParty = asyncHandler(async (req, res) => {
  res.status(200).json(await service.inventorParty(Number(req.params.inventorID)));
});

const parties = asyncHandler(async (req, res) => {
  const list = parseList(req.body.list, 'list');
  res.status(200).json(
    await service.parties({
      tenant: req.tenant,
      companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
      search: req.body.search,
      layout: req.body.layout,
      type: req.body.type,
      list,
      total: req.body.total === undefined ? list.length : Number(req.body.total),
      bankMode: isBankOrg(req),
    })
  );
});

const filedAssetEvents = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.filedAssetEvents(parseList(req.body.selectedCompanies, 'selectedCompanies'))
  );
});

const timeline = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.timeline({
      companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
      type: Number(req.body.type),
      parties: parseList(req.body.customers, 'customers'),
    })
  );
});

const counts = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.counts({
      companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
      types: parseList(req.body.type, 'type'),
      bankMode: isBankOrg(req),
    })
  );
});

const example = asyncHandler(async (req, res) => {
  const bank = service.isBank(req.body.format_type);
  res.status(200).json(
    await service.example({
      companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
      types: parseList(req.body.type, 'type'),
      parties: bank ? parseList(req.body.customers, 'customers') : [],
    })
  );
});

const metric = asyncHandler(async (req, res) => {
  const bank = service.isBank(req.body.format_type);
  const companies = parseList(req.body.selectedCompanies, 'selectedCompanies');
  const dataFormat = Number(req.body.data_format) || 0;

  // The cumulative-by-year series joins on representative_id, so it cannot be
  // built without a company. The legacy route emitted an unbound-parameter 500.
  if (dataFormat === 1 && !companies.length) {
    throw ApiError.badRequest('selectedCompanies is required when data_format is 1');
  }

  res.status(200).json(
    await service.metric({
      type: Number(req.body.type),
      dataFormat,
      bank,
      bankMode: isBankOrg(req),
      companies,
      parties: bank ? parseList(req.body.customers, 'customers') : [],
      transactions: bank ? parseList(req.body.assignments, 'assignments') : [],
      company: req.body.company,
    })
  );
});

const temp = asyncHandler(async (req, res) => {
  const bank = service.isBank(req.body.format_type);
  res.status(200).json(
    await service.temp({
      // The legacy contract: an empty `list` field means "nothing to recompute".
      hasList: req.body.list !== undefined && req.body.list !== '',
      type: Number(req.body.type),
      bank,
      companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
      parties: bank ? parseList(req.body.customers, 'customers') : [],
      tabs: parseList(req.body.tabs, 'tabs'),
      customers: parseList(req.body.customers, 'customers'),
      assignments: parseList(req.body.assignments, 'assignments'),
    })
  );
});

const share = asyncHandler(async (req, res) => {
  const url = await service.share({
    tenant: req.tenant,
    orgId: req.auth.orgId,
    userId: req.auth.userId,
    selectedCompanies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
    tabs: parseList(req.body.tabs, 'tabs'),
    customers: parseList(req.body.customers, 'customers'),
    shareButton: req.body.share_button,
  });
  // Plain text: the dashboard client uses the response body as the link itself.
  res.status(200).type('text/plain').send(url);
});

module.exports = {
  tiles,
  collateral,
  assignorParties,
  inventorParty,
  parties,
  filedAssetEvents,
  timeline,
  counts,
  example,
  metric,
  temp,
  share,
  parseList,
};
