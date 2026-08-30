'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./external.service');

const parseList = (raw, label) => {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    throw ApiError.badRequest(`${label} must be a JSON array`);
  }
};

const isBankOrg = (req) => Number(req.auth.orgType) === 2;

const ptab = asyncHandler(async (req, res) => {
  const events = await service.ptabEvents(req.params.asset);
  // ?counter returns just the tally, which is what the dashboard tile wants.
  if (req.query.counter !== undefined) return res.status(200).type('text/plain').send(`${events.length}`);
  return res.status(200).json(events);
});

const ptabDocument = asyncHandler(async (req, res) => {
  const body = await service.ptabDocument(req.params.identifier);
  res.status(200).type('application/octet-stream').send(body);
});

const citations = asyncHandler(async (req, res) => {
  let events;
  try {
    events = await service.citations(req.params.asset);
  } catch (err) {
    // The tile degrades to zero rather than failing the page when the upstream
    // API is unavailable, which is what the legacy route did.
    if (req.query.counter !== undefined) return res.status(200).type('text/plain').send('0');
    throw err;
  }
  if (req.query.counter !== undefined) return res.status(200).type('text/plain').send(`${events.length}`);
  return res.status(200).json(events);
});

const portfolioCitations = asyncHandler(async (req, res) => {
  const list = parseList(req.body.list, 'list');
  const countOnly = String(req.body.counter) === '1';

  const rows = await service.portfolioCitations({
    list,
    total: req.body.total === undefined ? list.length : Number(req.body.total),
    type: req.body.type,
    companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
    tabs: parseList(req.body.tabs, 'tabs'),
    customers: parseList(req.body.customers, 'customers'),
    assignments: parseList(req.body.assignments, 'assignments'),
    otherMode: String(req.body.other_mode) === 'true',
    bankMode: isBankOrg(req),
    orgId: req.auth.orgId,
    start: req.body.start,
    end: req.body.end,
    countOnly,
  });

  if (countOnly) return res.status(200).type('text/plain').send(`${rows.length}`);
  return res.status(200).json(rows);
});

module.exports = { ptab, ptabDocument, citations, portfolioCitations };
