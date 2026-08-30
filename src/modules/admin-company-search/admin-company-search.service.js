'use strict';

/**
 * The admin console's company-search and normalisation surface.
 *
 * "Normalising" here means pointing many recorded spellings of a company at one
 * canonical `representative` row, so the rest of the product can treat them as
 * the same entity. The same pattern applies to law firms and to lawyers, each
 * with their own representative table.
 */

const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');
const { runNodeScript } = require('../../utils/php-jobs');
const repository = require('./admin-company-search.repository');

/* ------------------------------------------------------ company requests */

const companyRequests = () => repository.companyRequests();

/**
 * Resolve a batch of "please add this company" requests.
 *
 * type 0 points them at a company in the corpus, anything else at another
 * customer account; only one of the two is ever set.
 */
const resolveCompanyRequests = async ({ companyIds, representativeId, type }) => {
  if (!companyIds.length) throw ApiError.badRequest('No companies were selected');
  if (!(representativeId > 0)) throw ApiError.badRequest('A target is required');

  const fields = Number(type) === 0
    ? { status: 1, representative_id: representativeId, account_id: 0 }
    : { status: 1, account_id: representativeId, representative_id: 0 };

  await repository.resolveCompanyRequests(companyIds, fields);
  return { updated: companyIds.length };
};

/* -------------------------------------------------------------- searching */

/**
 * MySQL boolean-mode search terms.
 *
 * Each line of the input is one phrase, quoted so it matches as a unit, with
 * the punctuation that would otherwise be operators removed.
 */
const booleanTerms = (input) =>
  String(input)
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/[.,+\-><()~*"@]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => `"${line}"`)
    .join(' ');

const searchCompanies = (term) => {
  if (!term) return [];
  return repository.searchParties(booleanTerms(term));
};

const searchRepresentatives = (name) => repository.searchRepresentatives(booleanTerms(name));
const searchAccounts = (name) => repository.searchAccounts(name);

const searchByAddress = ({ addresses, securityOnly }) => {
  if (!addresses.length) return [];
  return repository.searchPartiesByAddress({
    address: addresses.map((a) => `"${a}"`).join(' '),
    securityOnly,
  });
};

const searchLawFirmsByAddress = (addresses) => {
  if (!addresses.length) return [];
  return repository.searchLawFirmsByAddress(addresses.map((a) => `"${a}"`).join(' '));
};

const searchByCountry = (country) => repository.searchPartiesByCountry(country);

/* -------------------------------------------------------------- addresses */

const partyAddresses = ({ partyId, applicant }) =>
  repository.addressesForParty({ partyId, applicant });

const lawFirmAddresses = (lawFirmId) => repository.addressesForLawFirm(lawFirmId);

const addressesWithTransactions = (partyId) => repository.addressesWithTransactions(partyId);

/** Record which transaction a company's address was taken from. */
const rememberAddress = async ({ partyId, address1, address2 }) => {
  const latest = await repository.latestTransactionForAddress({ partyId, address1, address2 });
  if (!latest || !(latest.rf_id > 0)) return null;

  await repository.rememberAddressTransaction([{
    representative_id: latest.representativeID,
    rf_id: latest.rf_id,
    assignor_and_assignee_id: latest.assignor_and_assignee_id,
  }]);
  return latest;
};

/* ----------------------------------------------------- normalising names */

/**
 * Find or create the canonical row a set of names should point at.
 * @param {{find: Function, create: Function}} table
 */
const canonical = async (table, name) => {
  const existing = await table.find(name);
  if (existing) return existing;
  const created = await table.create(name);
  return created.toJSON ? created.toJSON() : created;
};

/**
 * Point a set of recorded party names at one canonical company.
 *
 * PTAB party names live in their own table and are matched by name rather than
 * by id, so they are updated separately.
 */
const normaliseCompanies = async ({ partyIds, ptabNames, normalizeName }) => {
  if (!normalizeName) throw ApiError.badRequest('A normalised name is required');
  if (!partyIds.length && !ptabNames.length) {
    throw ApiError.badRequest('No companies were selected');
  }

  const representative = await canonical(
    { find: repository.findRepresentativeByName, create: repository.createRepresentative },
    normalizeName
  );
  const representativeId = representative.representative_id;

  if (partyIds.length) await repository.pointPartiesAt(partyIds, representativeId);
  if (ptabNames.length) await repository.pointPtabNamesAt(ptabNames, representativeId);

  return {
    representative_id: representativeId,
    representative_name: normalizeName,
    normalised: partyIds.length + ptabNames.length,
  };
};

/* ------------------------------------------------------------- law firms */

const lawFirms = ({ search }) => repository.lawFirms({ search: search ? booleanTerms(search) : null });
const lawFirmCompanies = (lawFirmId) => repository.companiesForLawFirm(lawFirmId);
const companyLawFirms = (partyId) => repository.lawFirmsForCompany(partyId);

/**
 * Point a set of law firms at one canonical firm.
 *
 * Names the caller selected that we have correspondence for but no law_firm row
 * are created first, so the selection is not silently narrowed.
 */
const normaliseLawFirms = async ({ lawFirmIds, names, normalizeName }) => {
  if (!normalizeName) throw ApiError.badRequest('A normalised name is required');
  if (!lawFirmIds.length) throw ApiError.badRequest('No law firms were selected');

  let ids = [...lawFirmIds];

  if (names.length) {
    const known = await repository.lawFirmsByNames(names);
    const knownNames = new Set(known.map((row) => row.name));
    const missing = names.filter((name) => !knownNames.has(name));
    if (missing.length) {
      await repository.createLawFirmsFromCorrespondence(missing);
      const created = await repository.lawFirmsByNames(missing);
      ids = [...new Set([...ids, ...created.map((row) => row.law_firm_id)])];
    }
  }

  const representative = await canonical(
    { find: repository.findLawFirmRepresentative, create: repository.createLawFirmRepresentative },
    normalizeName
  );

  await repository.pointLawFirmsAt(ids, representative.representative_id);
  return {
    representative_id: representative.representative_id,
    representative_name: normalizeName,
    normalised: ids.length,
  };
};

/* --------------------------------------------------------------- lawyers */

const lawyers = ({ search }) => repository.lawyers({ search: search ? booleanTerms(search) : null });
const lawyersForFirm = (lawFirmId) => repository.lawyersForFirm(lawFirmId);

const normaliseLawyers = async ({ lawyerIds, normalizeName }) => {
  if (!normalizeName) throw ApiError.badRequest('A normalised name is required');
  if (!lawyerIds.length) throw ApiError.badRequest('No lawyers were selected');

  const representative = await canonical(
    { find: repository.findLawyerRepresentative, create: repository.createLawyerRepresentative },
    normalizeName
  );

  await repository.pointLawyersAt(lawyerIds, representative.representative_lawyer_id);
  return {
    representative_lawyer_id: representative.representative_lawyer_id,
    representative_name: normalizeName,
    normalised: lawyerIds.length,
  };
};

/* ----------------------------------------------------------- assignments */

const rawAssignment = async (rfId) => {
  const row = await repository.rawAssignment(rfId);
  if (!row) throw ApiError.notFound('No such transaction');
  return row;
};

/** Correct the correspondent recorded on an assignment. */
const updateAssignment = async ({ rfId, fields }) => {
  const existing = await repository.rawAssignment(rfId);
  if (!existing) throw ApiError.notFound('No such transaction');

  const allowed = [
    'cname', 'caddress_1', 'caddress_2', 'caddress_3',
    'caddress_4', 'caddress_5', 'caddress_6', 'caddress_7',
  ];
  const update = {};
  allowed.forEach((column) => {
    if (fields[column] !== undefined) update[column] = fields[column];
  });
  if (!Object.keys(update).length) throw ApiError.badRequest('Nothing to update');

  await repository.updateCorrespondent(rfId, update);
  return { rf_id: Number(rfId), updated: Object.keys(update) };
};

const recentTransactions = (limit) => repository.recentTransactions(limit);
const transactionsByConveyance = (conveyanceType) =>
  repository.transactionsByConveyance(conveyanceType);

/* ---------------------------------------------------------------- assets */

const partyAssets = (partyId) => repository.assetsForParty(partyId);
const companyMaintenance = (representativeId) => repository.maintenanceForCompany(representativeId);

/* ----------------------------------------------------------------- cited */

const citedOrganisations = (organisationId) => repository.citedOrganisations(organisationId);

const citedCounters = async (organisationId) => {
  const row = await repository.citedCounters(organisationId);
  return row || { total: 0, with_logo: 0 };
};

/** Correct one cited assignee's search name or its logo set. */
const updateCitedAssignee = async ({ assigneeId, fields }) => {
  if (!(assigneeId > 0)) throw ApiError.badRequest('An assignee is required');
  const assignee = await repository.findAssignee(assigneeId);
  if (!assignee) throw ApiError.notFound('No such assignee');

  const logoColumns = [
    'api_logo', 'api_logo1', 'api_logo2', 'api_logo3', 'api_logo4',
    'api_logo5', 'api_logo6', 'api_logo7', 'api_logo8', 'api_logo9',
    'without_square', 'image_url',
  ];

  let update = null;
  if (fields.assignee_query !== undefined) {
    update = { assignee_query: fields.assignee_query };
  } else if (fields.api_logo !== undefined) {
    update = {};
    logoColumns.forEach((column) => {
      if (fields[column] !== undefined) update[column] = fields[column];
    });
  } else if (fields.image_url !== undefined) {
    update = { image_url: fields.image_url };
  }

  if (!update) throw ApiError.badRequest('Nothing to update');
  await repository.updateAssignee(assigneeId, update);
  return { assignee_id: Number(assigneeId), updated: Object.keys(update) };
};

/**
 * Clear or re-download a set of assignee logos.
 *
 * The download used to be an `exec` with the id list interpolated into a shell
 * string; it is an argument array now (TEST_REPORT.md section 3).
 */
const assigneeLogos = async ({ assigneeIds, type }) => {
  if (!assigneeIds.length) throw ApiError.badRequest('No assignees were selected');

  if (type === 'clear') {
    await repository.clearAssigneeLogos(assigneeIds);
    return { message: 'Assignee data cleared' };
  }
  if (type === 'download') {
    runNodeScript('download_assignees_logos.js', [JSON.stringify(assigneeIds)])
      .catch((err) => logger.error('logo download failed', { error: err.message }));
    return { message: 'Assignee logo download script started' };
  }
  throw ApiError.badRequest(`Unknown logo action: ${type}`);
};

module.exports = {
  companyRequests,
  resolveCompanyRequests,
  searchCompanies,
  searchRepresentatives,
  searchAccounts,
  searchByAddress,
  searchLawFirmsByAddress,
  searchByCountry,
  partyAddresses,
  lawFirmAddresses,
  addressesWithTransactions,
  rememberAddress,
  normaliseCompanies,
  lawFirms,
  lawFirmCompanies,
  companyLawFirms,
  normaliseLawFirms,
  lawyers,
  lawyersForFirm,
  normaliseLawyers,
  rawAssignment,
  updateAssignment,
  recentTransactions,
  transactionsByConveyance,
  partyAssets,
  companyMaintenance,
  citedOrganisations,
  citedCounters,
  updateCitedAssignee,
  assigneeLogos,
  booleanTerms,
  canonical,
};
