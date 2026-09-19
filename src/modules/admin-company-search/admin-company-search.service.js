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
const { exchangeCode } = require('../../utils/google');
const { runNodeScript, runPhpScriptBackground } = require('../../utils/php-jobs');
const q = require('../../db/query');
const tenants = require('../../db/tenant-connections');
const {
  CONVEYANCE_ORDINALS, CONVEYANCE_TYPES, CONVEYANCE_CHOICES,
} = require('./conveyance.constants');
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
  // Without rf_id this reached the query as NaN and MySQL answered
  // "Unknown column 'NaN' in 'where clause'" — a 500 for a missing field.
  if (!Number.isFinite(rfId) || rfId <= 0) throw ApiError.badRequest('rf_id is required');
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

/* -------------------------------------------------- company selection */

/**
 * Turn a customer's companies on or off in their own database.
 *
 * `status` is what the console's checkbox column writes. The update is scoped by
 * company_id, so it only ever touches rows inside that customer's tenant.
 */
const setCompanySelection = async ({ organisationId, companyIds, status }) => {
  if (!companyIds.length) throw ApiError.badRequest('No companies were given');

  const tenant = await tenants.getConnection(Number(organisationId));
  if (!tenant) throw ApiError.serviceUnavailable('Organisation database is unavailable');

  const [, affected] = await tenant.query(
    'UPDATE representative SET status = :status WHERE company_id IN (:companyIds)',
    { replacements: { status: Number(status) ? 1 : 0, companyIds }, logging: false }
  );
  return { updated: affected ?? companyIds.length, status: Number(status) ? 1 : 0 };
};

/* ------------------------------------------------------- google oauth */

/**
 * Exchange the OAuth code the console received for Google tokens.
 *
 * Used by the cited-assignee spreadsheet export, which writes to a Google Sheet
 * on the operator's behalf. The tokens are handed back to the console and never
 * stored here.
 */
const googleAuthToken = async (code) => {
  if (!code) throw ApiError.badRequest('Authentication code is missing');
  try {
    return await exchangeCode(code);
  } catch (err) {
    logger.warn('google token exchange failed', { error: err.message });
    throw ApiError.badRequest('Unable to authenticate token');
  }
};

/* ---------------------------------------------- cited assignee ownership */

/**
 * Attach a set of cited assignees to an organisation.
 *
 * The legacy handler declared its result `const` and then assigned to it, so it
 * threw a TypeError on every successful call. The throw was swallowed by an
 * empty catch and no response was ever sent — the request hung until the client
 * gave up.
 */
const assignCitedToOrganisation = async ({ assigneeIds, organisationId }) => {
  if (!assigneeIds.length) throw ApiError.badRequest('No assignees were given');
  if (!organisationId) throw ApiError.badRequest('organisation_id is required');

  const [updated] = await repository.assignCitedToOrganisation({ assigneeIds, organisationId });
  return { updated: updated ?? assigneeIds.length, organisation_id: Number(organisationId) };
};

/* ------------------------------------------------- conveyance-text grid */

/**
 * The conveyance-text grid.
 *
 * Answers { list, conveyance, update_conveyance, type, assignment_type } — the
 * console reads all five: the rows, the filter options, the retype options and
 * the name→number map it posts back with.
 */
const transactionsFor = async ({ organisationId, portfolios }) => {
  const shape = {
    list: [],
    conveyance: CONVEYANCE_CHOICES,
    update_conveyance: CONVEYANCE_CHOICES,
    type: CONVEYANCE_TYPES,
    assignment_type: CONVEYANCE_ORDINALS,
  };
  const companyIds = await companyIdsFor({ organisationId, portfolios });
  if (!companyIds.length) return shape;
  return { ...shape, list: await repository.assignmentsForCompanies(companyIds) };
};

/** Retype one transaction. Only a known conveyance type is accepted. */
const retypeTransaction = async ({ rfId, conveyanceType }) => {
  if (!rfId) throw ApiError.badRequest('rf_id is required');
  if (!Object.prototype.hasOwnProperty.call(CONVEYANCE_ORDINALS, conveyanceType)) {
    throw ApiError.badRequest(`Unknown conveyance type: ${conveyanceType}`);
  }
  return repository.setReviewedConveyance({ rfId, conveyanceType });
};

const searchTransactions = (search) =>
  (search && search.length ? repository.searchConveyanceText(search) : Promise.resolve([]));

const companiesForLender = (lenderIds) =>
  (lenderIds.length ? repository.companiesForLender(lenderIds) : Promise.resolve([]));

/* ------------------------------------------------ correspondence lists */

/**
 * The correspondence lists behind GET /admin/company/assignments/:id and
 * /admin/company/raw/assignments/:id.
 *
 * `:id` is the CUSTOMER here, not a transaction. An earlier version of these
 * two routes read it as an rf_id and looked up a single assignment, so the
 * console's Correspondence column answered 404 for every customer.
 */
const correspondenceFor = async ({ organisationId, portfolios, raw }) => {
  const companyIds = await companyIdsFor({ organisationId, portfolios });
  if (!companyIds.length) return [];

  const rows = await repository.partyIdsForCompanies(companyIds);
  const partyIds = rows.map((r) => r.assignor_and_assignee_id);

  return raw
    ? repository.rawCorrespondence({ companyIds, partyIds })
    : repository.correspondenceAddresses({ companyIds, partyIds });
};

/* ----------------------------------------------------------------- cited */

/**
 * The customer's companies, either as chosen in the portfolio filter or all of
 * them. Every cited/party read is scoped by this list.
 */
const companyIdsFor = async ({ organisationId, portfolios }) => {
  if (portfolios && portfolios.length) return portfolios;
  const tenant = await tenants.getConnection(Number(organisationId));
  if (!tenant) return [];
  const rows = await q.selectAll(
    tenant,
    'SELECT company_id FROM representative WHERE company_id > 0 GROUP BY company_id'
  );
  return rows.map((r) => r.company_id);
};

/**
 * Cited assignees for a customer, paged.
 *
 * Answers { citedAssignees, organizations, total_records } — the console reads
 * those three keys off the response. An earlier version of this returned a bare
 * array, which left the cited panel permanently empty.
 */
const citedOrganisations = async (input) => {
  const empty = { citedAssignees: [], organizations: [], total_records: 0 };
  const companyIds = await companyIdsFor(input);
  if (!companyIds.length) return empty;

  const scope = { ...input, companyIds };
  const total = await repository.citedAssigneesCount(scope);
  if (!total) return empty;

  return {
    citedAssignees: await repository.citedAssigneesPage(scope),
    organizations: [],
    total_records: total,
  };
};

/**
 * Parties on the customer's transactions, paged.
 *
 * `savedLogos` switches to the logos a customer has saved for themselves rather
 * than the shared ones. Only the shared view records newly seen names, so
 * browsing the saved view never writes.
 */
const parties = async (input) => {
  const empty = { list: [], total_records: 0 };
  const companyIds = await companyIdsFor(input);
  if (!companyIds.length) return empty;

  const rows = await repository.partyNamesForCompanies(companyIds);
  const names = rows.map((r) => r.partyName).filter(Boolean);
  if (!names.length) return empty;

  if (!input.savedLogos) await repository.rememberPartyNames(names);

  const scope = { ...input, names };
  const total = await repository.partiesCount(scope);
  if (!total) return empty;

  return { list: await repository.partiesPage(scope), total_records: total };
};

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


/* -------------------------------------------------- representative report */

const representativeReports = () => repository.representativeReports();

/* --------------------------------------------------------- lender search */

/** Empty search returns [] rather than scanning the whole corpus. */
const searchLenders = (search) =>
  (search && search.length ? repository.searchLenders(search) : Promise.resolve([]));

/* ------------------------------------------- normalisation candidate lists */

const normalisationCandidates = (assignorAndAssigneeId) =>
  repository.normalisationCandidates(assignorAndAssigneeId);

const lawFirmNormalisationCandidates = (lawFirmId) =>
  repository.lawFirmNormalisationCandidates(lawFirmId);

/* ------------------------------------------------------- family rebuild */

/**
 * Kick off the family-assets rebuild for a customer. Fire-and-forget: the job
 * takes minutes, so the route acknowledges and the console polls the log.
 */
const runFamilyAssets = ({ customerId, representativeIds = [], retrieveAll }) => {
  runPhpScriptBackground('assets_family.php', [
    String(customerId),
    JSON.stringify(representativeIds),
    String(retrieveAll === undefined ? '' : retrieveAll),
  ]);
  return { message: representativeIds.length
    ? 'Run assets family with representatives'
    : 'Run assets family' };
};

module.exports = {
  parties,
  googleAuthToken,
  assignCitedToOrganisation,
  setCompanySelection,
  transactionsFor,
  retypeTransaction,
  searchTransactions,
  companiesForLender,
  correspondenceFor,
  representativeReports,
  searchLenders,
  normalisationCandidates,
  lawFirmNormalisationCandidates,
  runFamilyAssets,
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
