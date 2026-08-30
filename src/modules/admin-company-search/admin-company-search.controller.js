'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./admin-company-search.service');

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

/** The address list arrives as `address[]`, the shape a form post produces. */
const addressesFrom = (req) => {
  const raw = req.body['address[]'] !== undefined ? req.body['address[]'] : req.body.address;
  if (raw === undefined || raw === null || raw === '') return [];
  return Array.isArray(raw) ? raw : [raw];
};

/* ------------------------------------------------------ company requests */

const companyRequests = asyncHandler(async (req, res) => {
  res.status(200).json(await service.companyRequests());
});

const resolveCompanyRequests = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.resolveCompanyRequests({
      companyIds: parseList(req.body.company_ids, 'company_ids'),
      representativeId: Number(req.body.representative_id),
      type: req.body.type,
    })
  );
});

/* -------------------------------------------------------------- searching */

/** The grid sends its search term inside a filter array. */
const filterValue = (raw) => {
  if (!raw) return '';
  try {
    const filter = JSON.parse(raw);
    return Array.isArray(filter) && filter.length ? filter[0].value || '' : '';
  } catch (_err) {
    throw ApiError.badRequest('filter must be valid JSON');
  }
};

const searchAll = asyncHandler(async (req, res) => {
  res.status(200).json(await service.searchCompanies(filterValue(req.query.filter)));
});

const searchCompanies = asyncHandler(async (req, res) => {
  res.status(200).json(await service.searchCompanies(req.params.search));
});

const searchRepresentatives = asyncHandler(async (req, res) => {
  res.status(200).json(await service.searchRepresentatives(req.params.name));
});

const searchAccounts = asyncHandler(async (req, res) => {
  res.status(200).json(await service.searchAccounts(req.params.name));
});

const searchByAddress = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.searchByAddress({ addresses: [req.params.address], securityOnly: false })
  );
});

const searchByCountry = asyncHandler(async (req, res) => {
  res.status(200).json(await service.searchByCountry(req.params.name));
});

const searchCompanyAddresses = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.searchByAddress({
      addresses: addressesFrom(req),
      securityOnly: Number(req.params.type) === 1,
    })
  );
});

const searchLawFirmAddresses = asyncHandler(async (req, res) => {
  res.status(200).json(await service.searchLawFirmsByAddress(addressesFrom(req)));
});

/* -------------------------------------------------------------- addresses */

const lawFirmAddresses = asyncHandler(async (req, res) => {
  res.status(200).json(await service.lawFirmAddresses(Number(req.params.ID)));
});

const partyAddresses = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.partyAddresses({
      partyId: Number(req.params.ID),
      // flag 2 asks for the bibliographic applicant record instead.
      applicant: String(req.query.flag) === '2',
    })
  );
});

const addressesWithTransactions = asyncHandler(async (req, res) => {
  res.status(200).json(await service.addressesWithTransactions(Number(req.params.ID)));
});

const rememberAddress = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.rememberAddress({
      partyId: Number(req.params.ID),
      address1: req.body.address1,
      address2: req.body.address2,
    })
  );
});

/* ----------------------------------------------------- normalising names */

/**
 * The grid can send either a plain id list or the selected rows themselves.
 * A row's `flag` says which corpus it came from: 3 is PTAB, everything else is
 * the assignment corpus.
 */
const selectionFrom = (req) => {
  const rows = parseList(req.body.selected_rows, 'selected_rows');
  if (!rows.length || rows[0].flag === undefined) {
    return { partyIds: parseList(req.body.IDs, 'IDs'), ptabNames: [] };
  }
  const partyIds = [];
  const ptabNames = [];
  rows.forEach((row) => {
    if (Number(row.flag) === 3) ptabNames.push(row.name);
    else partyIds.push(row.id);
  });
  return { partyIds, ptabNames };
};

const normaliseCompanies = asyncHandler(async (req, res) => {
  const { partyIds, ptabNames } = selectionFrom(req);
  res.status(200).json(
    await service.normaliseCompanies({
      partyIds, ptabNames, normalizeName: req.body.normalize_name,
    })
  );
});

/* ------------------------------------------------------------- law firms */

const lawFirms = asyncHandler(async (req, res) => {
  res.status(200).json(await service.lawFirms({ search: req.query.search }));
});

const lawFirmCompanies = asyncHandler(async (req, res) => {
  res.status(200).json(await service.lawFirmCompanies(Number(req.params.id)));
});

const companyLawFirms = asyncHandler(async (req, res) => {
  res.status(200).json(await service.companyLawFirms(Number(req.params.companyID)));
});

const normaliseLawFirms = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.normaliseLawFirms({
      lawFirmIds: parseList(req.body.law_firm_ids, 'law_firm_ids'),
      names: parseList(req.body.names, 'names'),
      normalizeName: req.body.normalize_name,
    })
  );
});

/* --------------------------------------------------------------- lawyers */

const lawyers = asyncHandler(async (req, res) => {
  res.status(200).json(await service.lawyers({ search: req.query.search }));
});

const lawyersForFirm = asyncHandler(async (req, res) => {
  res.status(200).json(await service.lawyersForFirm(Number(req.params.id)));
});

const normaliseLawyers = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.normaliseLawyers({
      lawyerIds: parseList(req.body.lawyer_ids, 'lawyer_ids'),
      normalizeName: req.body.normalize_name,
    })
  );
});

/* ----------------------------------------------------------- assignments */

const rawAssignment = asyncHandler(async (req, res) => {
  res.status(200).json(await service.rawAssignment(Number(req.params.id)));
});

const updateAssignment = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.updateAssignment({
      rfId: Number(req.body.rf_id || req.params.id),
      fields: req.body,
    })
  );
});

const recentTransactions = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) > 0 ? Math.min(Number(req.query.limit), 1000) : 100;
  res.status(200).json(await service.recentTransactions(limit));
});

const transactionsByConveyance = asyncHandler(async (req, res) => {
  res.status(200).json(await service.transactionsByConveyance(req.params.conveyanceType));
});

/* ---------------------------------------------------------------- assets */

const partyAssets = asyncHandler(async (req, res) => {
  res.status(200).json(await service.partyAssets(Number(req.params.entityID)));
});

const companyMaintenance = asyncHandler(async (req, res) => {
  res.status(200).json(await service.companyMaintenance(Number(req.params.representativeID)));
});

/* ----------------------------------------------------------------- cited */

const citedOrganisations = asyncHandler(async (req, res) => {
  res.status(200).json(await service.citedOrganisations(Number(req.params.id)));
});

const citedCounters = asyncHandler(async (req, res) => {
  res.status(200).json(await service.citedCounters(Number(req.query.client_id || req.auth.orgId)));
});

const updateCitedAssignee = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.updateCitedAssignee({
      assigneeId: Number(req.body.assignee_id),
      fields: req.body,
    })
  );
});

const assigneeLogos = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.assigneeLogos({
      assigneeIds: parseList(req.body.assignee_id, 'assignee_id'),
      type: req.body.type,
    })
  );
});

module.exports = {
  companyRequests, resolveCompanyRequests,
  searchAll, searchCompanies, searchRepresentatives, searchAccounts,
  searchByAddress, searchByCountry, searchCompanyAddresses, searchLawFirmAddresses,
  lawFirmAddresses, partyAddresses, addressesWithTransactions, rememberAddress,
  normaliseCompanies,
  lawFirms, lawFirmCompanies, companyLawFirms, normaliseLawFirms,
  lawyers, lawyersForFirm, normaliseLawyers,
  rawAssignment, updateAssignment, recentTransactions, transactionsByConveyance,
  partyAssets, companyMaintenance,
  citedOrganisations, citedCounters, updateCitedAssignee, assigneeLogos,
  selectionFrom, filterValue, addressesFrom,
};
