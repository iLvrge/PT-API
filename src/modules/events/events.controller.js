'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./events.service');

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

/** ?counter asks for the size of the result rather than the result. */
const countOr = (req, res, rows) => {
  if (req.query.counter !== undefined) {
    return res.status(200).type('text/plain').send(`${rows.length}`);
  }
  return res.status(200).json(rows);
};

const lifeSpanForSelection = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.lifeSpanForSelection({
      type: req.query.type,
      companies: parseList(req.query.companies, 'companies'),
      tabs: parseList(req.query.tabs, 'tabs'),
      customers: parseList(req.query.customers, 'customers'),
      assignments: parseList(req.query.rf_ids, 'rf_ids'),
    })
  );
});

const lifeSpanForAssets = asyncHandler(async (req, res) => {
  res.status(200).json(await service.lifeSpanForAssets(parseList(req.body.list, 'list')));
});

const maintenanceAbandonment = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.maintenanceAbandonment({
      type: req.body.type,
      companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
      bankMode: isBankOrg(req),
    })
  );
});

const yearlyAbandonment = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.yearlyAbandonment({
      type: req.body.type,
      companies: parseList(req.body.selectedCompanies, 'selectedCompanies'),
      bankMode: isBankOrg(req),
    })
  );
});

const eventsForAsset = asyncHandler(async (req, res) => {
  const result = await service.eventsForAsset({
    applicationNumber: req.params.applicationNumber,
    patentNumber: req.params.patentNumber,
  });
  if (req.query.counter !== undefined) {
    return res.status(200).type('text/plain').send(`${result.events.length}`);
  }
  return res.status(200).json(result);
});

const assetStatus = asyncHandler(async (req, res) => {
  const result = await service.assetStatus(req.params.applicationNumber);
  if (req.query.counter !== undefined) {
    return res.status(200).type('text/plain').send(`${result.status.length}`);
  }
  return res.status(200).json(result);
});

const assetsByCategory = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.assetsByCategory({
      categoryType: req.params.category_type,
      companies: parseList(req.query.companies, 'companies'),
      customers: parseList(req.query.customers, 'customers'),
      bankMode: isBankOrg(req),
    })
  );
});

const assetToRecordDetail = asyncHandler(async (req, res) => {
  res.status(200).json(await service.assetToRecordDetail(req.params.application));
});

const transactionAssets = asyncHandler(async (req, res) => {
  res.status(200).json(await service.transactionAssets(Number(req.params.rfID)));
});

/* ---------------------------------------------------- tab-scoped life spans */

const tabLifeSpan = asyncHandler(async (req, res) => {
  const companies = req.params.companyID || req.params.representativeID;
  res.status(200).json(
    await service.lifeSpanForSelection({
      type: req.query.type,
      companies: companies ? [Number(companies)] : [],
      tabs: [Number(req.params.tabID)],
      customers: req.params.customerID ? [Number(req.params.customerID)] : [],
      assignments: req.params.rfID ? [Number(req.params.rfID)] : [],
    })
  );
});

module.exports = {
  lifeSpanForSelection,
  lifeSpanForAssets,
  maintenanceAbandonment,
  yearlyAbandonment,
  eventsForAsset,
  assetStatus,
  assetsByCategory,
  assetToRecordDetail,
  transactionAssets,
  tabLifeSpan,
  countOr,
};
