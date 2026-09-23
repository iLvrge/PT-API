'use strict';

/**
 * The admin console's customer management: organisations, their users, the
 * report runs and the data-pipeline jobs.
 */

const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');
const jobs = require('../../jobs/queue');
const { uploadFile } = require('../../utils/uploads');
const q = require('../../db/query');
const tenants = require('../../db/tenant-connections');
const repository = require('./admin-customers.repository');
const { illustrationJson } = require('../../utils/background-job');
const files = require('./admin-customers.files');

/* ------------------------------------------------------------- customers */

const listCustomers = () => repository.listCustomers();

const customer = async (organisationId) => {
  const org = await repository.findCustomer(organisationId);
  if (!org) throw ApiError.notFound('Customer not found');
  return {
    name: org.name,
    organisation_type: org.organisation_type,
    organisation_id: org.organisation_id,
    subscribtion: org.subscribtion,
    logo: org.logo,
    standard: org.standard,
  };
};

/** Create a customer and kick off provisioning of its tenant database. */
const createCustomer = async ({ companyName, organisationType }) => {
  if (!companyName) throw ApiError.badRequest('A company name is required');

  const existing = await repository.findCustomerByName(companyName);
  const created = existing || await repository.createCustomer({
    name: companyName, country_id: 1, organisation_type: organisationType, subscribtion: 3,
  });
  const org = created && created.toJSON ? created.toJSON() : created;
  if (!org || !(org.organisation_id > 0)) throw ApiError.internal('Could not create the customer');

  await repository.assignUuid(org.organisation_id);
  jobs.enqueue('customer.provision', { organisationId: org.organisation_id }).catch((err) =>
    logger.error('customer provisioning could not be queued', {
      organisationId: org.organisation_id, error: err.message,
    }));

  return org;
};

const updateCustomer = async ({ organisationId, companyName, organisationType, subscription }) => {
  if (!companyName) throw ApiError.badRequest('Name cannot be blank');
  const org = await repository.findCustomer(organisationId);
  if (!org) throw ApiError.notFound('Client not found');

  await repository.updateCustomer(organisationId, {
    name: companyName,
    organisation_type: organisationType,
    subscribtion: subscription === undefined ? 3 : subscription,
  });

  return {
    name: companyName,
    logo: org.logo,
    organisation_type: organisationType,
    subscribtion: subscription === undefined ? 3 : subscription,
    organisation_id: org.organisation_id,
  };
};

/**
 * Delete a customer that was never provisioned.
 *
 * The legacy version deleted `where representative_id = :id` — a column the
 * organisation table does not have — inside a transaction it never committed
 * or rolled back, leaking one per call.
 */
const deleteCustomer = async (organisationId) => {
  const org = await repository.findCustomer(organisationId);
  if (!org) throw ApiError.notFound('Customer not found');

  const database = await repository.customerDatabase(organisationId);
  if (database && database.org_db && database.org_usr && database.org_host) {
    throw ApiError.forbidden('Cannot delete a customer that has a database');
  }

  const transaction = await repository.connections.business.transaction();
  try {
    await repository.destroyCustomer(organisationId);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
  return { organisation_id: Number(organisationId), deleted: true };
};

/** PUT /customers/:id/logo — store a base64 logo and record its URL. */
const setLogo = async ({ organisationId, dataUrl }) => {
  const org = await repository.findCustomer(organisationId);
  if (!org) throw ApiError.notFound('Customer not found');

  const marker = dataUrl ? dataUrl.indexOf(';base64,') : -1;
  if (marker === -1) throw ApiError.badRequest('Expected a base64 data URL');

  const types = [
    ['image/jpeg', 'jpeg'], ['image/svg+xml', 'svg'], ['image/bmp', 'bmp'], ['image/png', 'png'],
  ];
  const [contentType, extension] = types.find(([mime]) => dataUrl.includes(mime)) || types[3];

  const body = Buffer.from(dataUrl.slice(marker + ';base64,'.length), 'base64');
  const stored = await uploadFile(body, 'logos', `logo_${organisationId}.${extension}`, contentType);

  await repository.updateCustomer(organisationId, { logo: stored.Location });
  return { logo: stored.Location };
};

/* ----------------------------------------------------------- admin users */

const listAdminUsers = () => repository.listAdminUsers();

const createAdminUser = async ({ firstName, lastName, username, password }) => {
  if (!username) throw ApiError.badRequest('A username is required');
  if (!password) throw ApiError.badRequest('A password is required');

  const created = await repository.createAdminUser({ firstName, lastName, username, password });
  const user = created.toJSON ? created.toJSON() : created;
  return {
    id: user.user_id,
    user_id: user.user_id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
  };
};

const updateAdminUser = async ({ userId, firstName, password }) => {
  if (!password) throw ApiError.badRequest('A password is required');
  if (!(await repository.findAdminUser(userId))) throw ApiError.notFound('User not found');
  await repository.updateAdminUser(userId, { firstName, password });
  return { user_id: Number(userId), updated: true };
};

/**
 * Delete a customer user.
 *
 * The row exists in two databases on two servers, so one transaction cannot
 * span them. The business row goes first because that is the row that grants
 * access: if the tenant row then fails, the user is already locked out and the
 * leftover is reported rather than the whole request refused.
 */
const deleteCustomerUser = async ({ organisationId, userId }) => {
  const user = await repository.findUserInOrganisation(userId, organisationId);
  if (!user) throw ApiError.notFound('User not found');

  const tenant = await tenants.getConnection(Number(organisationId));
  if (!tenant) throw ApiError.serviceUnavailable('Unable to connect to the customer database');

  const businessTx = await repository.connections.business.transaction();
  try {
    await repository.destroyBusinessUser(userId, businessTx);
    await businessTx.commit();
  } catch (err) {
    await businessTx.rollback();
    throw err;
  }

  try {
    await tenant.query('DELETE FROM user WHERE user_id = :userId', {
      replacements: { userId }, logging: false,
    });
  } catch (err) {
    logger.warn('customer user removed from business but not from the tenant', {
      organisationId, userId, error: err.message,
    });
    return { deleted: true, message: 'User deleted, but the client record could not be removed.' };
  }

  return { deleted: true, message: 'User deleted successfully.' };
};

/* --------------------------------------------------------------- reports */

const runReport = ({ representativeName, queryNo, companyId, organisationId }) =>
  repository.runReport({ representativeName, queryNo, companyId, organisationId });

/* ------------------------------------------------------------------ logs */

const updateLogs = (companyIds) => (companyIds.length ? repository.updateLogs(companyIds) : []);
const clearUpdateLogs = async (companyIds) => {
  if (companyIds.length) await repository.destroyUpdateLogs(companyIds);
  return { deleted: true };
};

const familyLogs = (input) => repository.familyLogs(input);
const clearFamilyLogs = async (input) => {
  await repository.destroyLogMessages('log_family_assets_messages', input);
  return { deleted: true };
};

/**
 * The reclassify log, with each entry's start time filled in from the previous
 * entry's end — the table only records when each step finished.
 */
const reclassifyLogs = async (input) => {
  const rows = await repository.reclassifyLogs(input);
  return rows.map((row, index, all) => (
    index > 0 ? { ...row, start_time: all[index - 1].end_time } : { ...row }
  ));
};
const clearReclassifyLogs = async (input) => {
  await repository.destroyLogMessages('log_messages', input);
  return { deleted: true };
};

/* -------------------------------------------- customer company list */

const num = (v) => Number(v) || 0;
const ratio = (top, bottom) => (top && bottom ? Math.floor(top / bottom) : 0);

/**
 * The customer's companies with their report figures attached.
 *
 * The company rows come from the tenant database and the figures from the
 * shared corpus, so they are joined in JS — the two live on different servers
 * in some deployments. A company with no summary row yet renders as zeros
 * rather than being dropped.
 */
const customerCompanies = async (organisationId) => {
  const org = await repository.findCustomer(organisationId);
  if (!org) return [];

  const tenant = await tenants.getConnection(Number(organisationId));
  if (!tenant) return [];

  const companies = await q.selectAll(
    tenant,
    `SELECT company_id AS representative_id, original_name, representative_name, status
       FROM representative
      WHERE company_id > 0
      GROUP BY company_id
      ORDER BY representative_name ASC, original_name ASC`
  );
  if (!companies.length) return companies;

  const ids = companies.map((c) => c.representative_id).filter((id) => id !== 0);
  if (!ids.length) return companies;

  const [reports, updates, families] = await Promise.all([
    repository.summaryForCompanies(ids),
    repository.latestUpdateLogByCompany(ids),
    repository.latestFamilyLogByCompany(ids),
  ]);

  const byCompany = (rows) => new Map(rows.map((r) => [r.company_id, r]));
  const reportMap = byCompany(reports);
  const updateMap = byCompany(updates);
  const familyMap = byCompany(families);

  return companies.map((representative) => {
    const report = reportMap.get(representative.representative_id) || {};
    const update = updateMap.get(representative.representative_id) || {};
    const family = familyMap.get(representative.representative_id) || {};
    const assets = num(report.assets);
    const transactions = num(report.no_of_transactions);
    const product = num(report.product);
    const endTime = update.end_time ? new Date(update.end_time) : null;

    return {
      ...representative,
      assets,
      no_of_transactions: transactions,
      no_of_entities: num(report.no_of_entities),
      no_of_employees: num(report.no_of_employees),
      no_of_parties: num(report.no_of_parties),
      product,
      arrow_assets: ratio(product, assets),
      arrow_transactions: ratio(product, transactions),
      family: num(family.retrieved_assets),
      updated: endTime && !Number.isNaN(endTime.getTime())
        ? endTime.toISOString().slice(0, 10)
        : null,
    };
  });
};

/* ------------------------------------------------------- asset lookup */

/**
 * The illustration JSON for one asset, for the console's patent lookup.
 *
 * The number is checked against documentid first so an unknown one answers 400
 * rather than making the caller wait on the pipeline. The pipeline itself
 * degrades to an empty body when it cannot produce anything, which is what the
 * console expects.
 */
const assetIllustration = async ({ asset, flag, orgId, userId }) => {
  const known = await repository.assetExists(asset, flag);
  if (!known) throw ApiError.badRequest('Invalid number');
  return illustrationJson({ asset, flag: flag ?? '', orgId, userId });
};

/* ------------------------------------------------------- customer patents */

const customerPatents = async ({ organisationId, representativeIds, direction }) => {
  const org = await repository.findCustomer(organisationId);
  if (!org) return [];
  return repository.customerPatents({ organisationId, representativeIds, direction });
};

/* ------------------------------------------------------ customer reports */

/**
 * Dashboard totals for one customer.
 *
 * Mirrors the legacy guard chain: an organisation with no tenant database, or
 * with no top-level (type 0) representatives yet, reports nothing rather than
 * erroring — the admin console renders a row per customer and half of them are
 * not provisioned.
 */
const customerReport = async (organisationId) => {
  const org = await repository.findCustomer(organisationId);
  if (!org) return {};

  const tenant = await tenants.getConnection(Number(organisationId));
  if (!tenant) return {};

  const hasCompanies = await q.exists(
    tenant,
    'SELECT 1 FROM representative WHERE type = 0 LIMIT 1'
  );
  if (!hasCompanies) return {};

  const [summary, shared] = await Promise.all([
    repository.summaryForOrganisation(organisationId),
    repository.hasShareLink(organisationId),
  ]);
  if (!summary) return {};
  return shared ? { ...summary, share_url: 1 } : summary;
};

/* ------------------------------------------------- dashboard totals, bulk */

/**
 * Dashboard totals for many customers in one call.
 *
 * The console currently asks per customer, which is one request per row — 330
 * on a full page load, past the default global rate limit of 300 per fifteen
 * minutes, so the last rows answer 429 and render as zeros. Two queries here
 * replace all of them.
 *
 * Customers with no summary row are omitted rather than returned as zeros, so
 * the caller can tell "nothing computed yet" from "computed as zero".
 */
const customerReports = async (organisationIds) => {
  if (!organisationIds.length) return {};

  const [summaries, shared] = await Promise.all([
    repository.summariesForOrganisations(organisationIds),
    repository.organisationsWithShareLink(organisationIds),
  ]);

  const sharedIds = new Set(shared.map((r) => Number(r.organisation_id)));
  const byOrganisation = {};
  for (const row of summaries) {
    const id = Number(row.organisation_id);
    byOrganisation[id] = sharedIds.has(id) ? { ...row, share_url: 1 } : row;
  }
  return byOrganisation;
};

/* ------------------------------------------------------- account switches */

const listSwitches = (organisationId) => repository.listAccountProcesses(organisationId);
const setSwitch = async ({ organisationId, buttonId, status }) => {
  // button_id selects which switch to write. Missing, it reached the query as
  // NaN and MySQL answered "Unknown column 'NaN' in 'where clause'".
  if (!Number.isFinite(buttonId)) throw ApiError.badRequest('button_id is required');
  if (!Number.isFinite(status)) throw ApiError.badRequest('status is required');
  return repository.upsertAccountProcess({ organisationId, buttonId, status });
};

/* ---------------------------------------------------------- entity files */

const entityFile = ({ organisationId, type, portfolios }) =>
  files.readEntityFile(files.entityFileName({ organisationId, type, portfolios }));

const entityFileByName = (fileName) => files.readEntityFile(fileName);

/* ------------------------------------------------------- pipeline jobs */

/**
 * Ask the normaliser to rebuild an organisation's entity suggestions.
 *
 * The legacy version built this as a shell string with the request values
 * interpolated, so a value containing a quote and a semicolon ran as a second
 * command. It is an argument array now.
 */
/**
 * The console's Entities list — GET /admin/customers/customers/:id/:portfolios/3
 * with no `suggestions` or `fixed_identicals`.
 *
 * The port answered this with a 202 and started the normalisation script,
 * which is what the legacy handler did only when those two flags were sent;
 * without them it returned the list. So the Entities button showed nothing.
 *
 * The repository groups by exact name; the legacy handler then folded names
 * that differ only in case or surrounding space into one row, summing counts.
 * That fold is kept - the grid shows one row per distinct party.
 */
const YEARS_OF_HISTORY = 24;
const yearFloor = () => `${new Date().getFullYear() - YEARS_OF_HISTORY}-01-01`;

const customerCompanyIds = async ({ organisationId, representativeIds }) => {
  if (representativeIds && representativeIds.length) return representativeIds;
  const tenant = await tenants.getConnection(Number(organisationId));
  if (!tenant) return [];
  const rows = await q.selectAll(
    tenant, 'SELECT company_id FROM representative WHERE company_id > 0 GROUP BY company_id'
  );
  return rows.map((r) => r.company_id);
};

const entitiesForCustomer = async ({ organisationId, representativeIds }) => {
  const companyIds = await customerCompanyIds({ organisationId, representativeIds });
  if (!companyIds.length) return [];
  return foldParties(await repository.entitiesForCustomer({ companyIds, yearFloor: yearFloor() }));
};

/**
 * The console's Inventors list — the same route with type 1. Two sources, as
 * before: inventors assigning to their employer on the customer's transactions,
 * and inventors named on the customer's applications in the bibliographic
 * databases. Fetched together; each takes 15–30 seconds for a large customer.
 */
const inventorsForCustomer = async ({ organisationId, representativeIds }) => {
  const companyIds = await customerCompanyIds({ organisationId, representativeIds });
  if (!companyIds.length) return [];
  const scope = { companyIds, yearFloor: yearFloor() };
  const [assignors, inventors] = await Promise.all([
    repository.inventorAssignorsForCustomer(scope),
    repository.bibliographicInventorsForCustomer(scope),
  ]);
  return foldParties([...assignors, ...inventors]);
};

/** One row per name, case- and space-insensitive, counts summed, sorted by name. */
const foldParties = (rows) => {
  const byName = new Map();
  rows.forEach((row) => {
    const key = String(row.name || '').trim().toLowerCase();
    const seen = byName.get(key);
    if (seen) { seen.counter += Number(row.counter); return; }
    byName.set(key, {
      id: row.assignor_and_assignee_id,
      name: row.name,
      normalize_name: row.normalize_name,
      counter: Number(row.counter),
      total_occurences: row.total_occurences,
      representative_company: row.representativeCompany,
      rf_id: row.rf_id,
      flag: row.flag,
    });
  });
  return [...byName.values()].sort((a, b) => (a.name > b.name ? 1 : b.name > a.name ? -1 : 0));
};

const normaliseNames = ({ organisationId, representativeIds, type, suggestions, fixedIdenticals }) => {
  jobs.enqueue('names.normalise', {
    organisationId,
    representativeIds: representativeIds || [],
    type,
    suggestions,
    fixedIdenticals,
  }).catch((err) => logger.error('name normalisation could not be queued', {
    organisationId, error: err.message,
  }));
};

const requireCustomer = async (organisationId) => {
  const org = await repository.findCustomer(organisationId);
  if (!org) throw ApiError.notFound('Customer not found');
  return org;
};

/** Recompute the automatic flags for some or all of a customer's companies. */
const runFlagUpdate = async ({ organisationId, companyIds }) => {
  await requireCustomer(organisationId);
  if (companyIds.length > 1) {
    await jobs.enqueue('repair.update-flag-bulk', { organisationId, companyIds });
  } else {
    await jobs.enqueue('repair.update-flag', {
      organisationId, companyId: companyIds[0] === undefined ? '' : companyIds[0],
    });
  }
  return { message: 'Fixing flag in process' };
};

const runMissingConveyance = async ({ organisationId, companyId }) => {
  await requireCustomer(organisationId);
  await jobs.enqueue('repair.missing-conveyance', {
    organisationId, companyId: companyId === undefined ? '' : companyId,
  });
  return { message: 'Fixing conveyance in process' };
};

const findMissingInventors = async ({ organisationId, representativeId }) => {
  await requireCustomer(organisationId);
  const running = await repository.findInventorProcess({ organisationId, representativeId });
  if (running) return { message: 'Already in process.' };

  await repository.createInventorProcess({ organisationId, representativeId });
  await jobs.enqueue('repair.missing-inventors', { organisationId, representativeId });
  return { message: 'Finding the number of assignments with a missing inventor.' };
};

const stopMissingInventors = async ({ organisationId, representativeId }) => {
  await repository.stopInventorProcess({ organisationId, representativeId });
  return { message: 'Stopped.' };
};

/* -------------------------------------------------- manual inventor flag */

/**
 * Flag a set of parties as employee-inventors by hand, from the console's
 * inventor review screen.
 */
const flagInventors = async ({ organisationId, partyIds, flag }) => {
  await requireCustomer(organisationId);
  if (!partyIds.length) throw ApiError.badRequest('No inventors were given');

  await repository.setEmployerAssign({ partyIds, flag });
  if (Number(flag) === 1) await repository.rememberInventors(partyIds);

  return { updated: partyIds.length, flag: Number(flag) };
};

/**
 * GET /admin/customers/:id/publish — rebuild a customer's application data.
 *
 * This is the console's "Update" button, and the port had it wrong in three
 * ways. It called `update_client_companies.php`, a script that exists in no
 * pipeline repository and that the legacy handler never named — so the call
 * failed on every invocation, silently, because the failure was logged and
 * dropped. It also lost the two things the legacy handler did first: refusing
 * when the customer has no users, and honouring the `company_id` selection.
 *
 * The console sends `?company_id=<JSON array>` — the portfolio rows the user
 * ticked. Empty means the whole organisation, one job. A selection means one
 * job per company, with the legacy handler's trailing "1".
 */
const publishCompanies = async (organisationId, companyIds = []) => {
  const org = await requireCustomer(organisationId);

  // Rebuilding a customer's database before anyone can log into it is wasted
  // work; the legacy handler said so rather than pretending to succeed.
  const users = await repository.countUsersInOrganisation(organisationId);
  if (!users) {
    return { message: 'Please create a admin user first for this customer.', name: org.name };
  }

  if (!companyIds.length) {
    const queued = await jobs.enqueue('company.build-application-data', {
      organisationId, companyId: '',
    });
    return { message: 'UPDATED!', name: org.name, jobIds: [queued.id] };
  }

  const queued = [];
  for (const companyId of companyIds) {
    // Sequential so the ids come back in the order they were requested; the
    // dedupe key is per company, so these do not collapse into one another.
    const job = await jobs.enqueue('company.build-application-data', {
      organisationId, companyId, extra: '1',
    });
    queued.push(job.id);
  }
  return { message: 'UPDATED!', name: org.name, jobIds: queued };
};

const publishAddresses = async (organisationId) => {
  await requireCustomer(organisationId);
  await jobs.enqueue('customer.publish-addresses', { organisationId });
  return { message: 'UPDATED!' };
};

const createTree = async (organisationId) => {
  const org = await requireCustomer(organisationId);
  jobs.enqueue('customer.build-tree', { organisationName: org.name })
    .catch((err) => logger.error('tree build could not be queued', { organisationId, error: err.message }));
  return { message: 'Tree build started' };
};

const retrieveCitedPatents = async ({ customerId, companies, type }) => {
  await jobs.enqueue('cited.retrieve-assignees', { customerId, companies, type });
  return { message: 'Run retrieved assignee script.' };
};

const retrieveCitedPatentDomains = async ({ customerId, apiName, assignees }) => {
  await jobs.enqueue('cited.retrieve-domains', { customerId, apiName, assignees });
  return { message: 'run domain script' };
};

const retrieveCitedPatentLogos = async (input) => {
  const { clientId, apiName, assignees, all, companyId, type, sourceData } = input;
  await jobs.enqueue('cited.retrieve-logos', {
    clientId, apiName, assignees, companyId, all, type, sourceData,
  });
  return { message: 'run logo script' };
};

module.exports = {
  listCustomers,
  customer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  setLogo,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteCustomerUser,
  runReport,
  customerCompanies,
  assetIllustration,
  customerPatents,
  customerReport,
  customerReports,
  updateLogs,
  clearUpdateLogs,
  familyLogs,
  clearFamilyLogs,
  reclassifyLogs,
  clearReclassifyLogs,
  listSwitches,
  setSwitch,
  entityFile,
  entityFileByName,
  normaliseNames,
  entitiesForCustomer,
  inventorsForCustomer,
  runFlagUpdate,
  runMissingConveyance,
  findMissingInventors,
  flagInventors,
  stopMissingInventors,
  publishCompanies,
  publishAddresses,
  createTree,
  retrieveCitedPatents,
  retrieveCitedPatentDomains,
  retrieveCitedPatentLogos,
};
