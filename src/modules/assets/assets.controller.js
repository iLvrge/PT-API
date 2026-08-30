'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./assets.service');

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

/** The selection fields every CPC endpoint shares. */
const selectionFrom = (req) => {
  const list = parseList(req.body.list, 'list');
  return {
    list,
    total: req.body.total === undefined ? list.length : Number(req.body.total),
    type: req.body.type,
    companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
    tabs: parseList(req.body.tabs, 'tabs'),
    customers: parseList(req.body.customers, 'customers'),
    assignments: parseList(req.body.assignments, 'assignments'),
    scope: parseList(req.body.scope, 'scope'),
    years: parseList(req.body.year, 'year'),
    range: req.body.range,
    dataType: Number(req.body.data_type) || 0,
    otherMode: String(req.body.other_mode) === 'true',
    bankMode: isBankOrg(req),
    orgId: req.auth.orgId,
  };
};

const list = asyncHandler(async (req, res) => {
  res.status(200).json(await service.list(req.auth.orgId));
});

const grantYears = asyncHandler(async (req, res) => {
  res.status(200).json(await service.grantYears(parseList(req.body.list, 'list')));
});

const cpcBreakdown = asyncHandler(async (req, res) => {
  res.status(200).json(await service.cpcBreakdown(selectionFrom(req)));
});

const cpcCellAssets = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.cpcCellAssets({
      ...selectionFrom(req),
      year: req.params.year,
      cpcCode: req.params.cpcCode,
    })
  );
});

const illustration = asyncHandler(async (req, res) => {
  const body = await service.illustration({
    asset: req.params.asset,
    flag: req.query.flag,
    orgId: req.auth.orgId,
    userId: req.auth.userId,
  });
  res.status(200).type('application/json').send(body);
});

const outsource = asyncHandler(async (req, res) => {
  const url = await service.outsourceUrl({
    patentNumber: req.params.patentNumber,
    type: req.params.type,
    flag: req.query.flag,
  });
  // The legacy route answered 200 with an empty body when nothing matched.
  if (!url) return res.status(200).send('');
  return res.status(200).json({ url });
});

const download = asyncHandler(async (req, res) => {
  res.status(200).json({ link: await service.downloadLink(Number(req.params.itemID)) });
});

const move = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.move({
      movedAssets: parseList(req.body.moved_assets, 'moved_assets'),
      orgId: req.auth.orgId,
    })
  );
});

const rollback = asyncHandler(async (req, res) => {
  res.status(200).json({ deleted: await service.rollback(parseList(req.query.revert, 'revert')) });
});

const validate = asyncHandler(async (req, res) => {
  res.status(200).json(await service.validate(parseList(req.body.foreign_assets, 'foreign_assets')));
});

const listForSale = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.listForSale({
      appnoDocNum: req.body.appno_doc_num,
      grantDocNum: req.body.grant_doc_num,
      type: req.body.type,
      orgId: req.auth.orgId,
    })
  );
});

/** The Google Sheets and Slack tiers are not ported yet. */
const notPorted = (what) =>
  asyncHandler(async () => {
    throw new ApiError(501, `${what} is not implemented yet`);
  });

module.exports = {
  list,
  grantYears,
  cpcBreakdown,
  cpcCellAssets,
  illustration,
  outsource,
  download,
  move,
  rollback,
  validate,
  listForSale,
  notPorted,
};
