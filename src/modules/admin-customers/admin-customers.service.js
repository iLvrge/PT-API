'use strict';

/**
 * The admin console's customer management: organisations, their users, the
 * report runs and the data-pipeline jobs.
 */

const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');
const { runPhpScript, runNodeScript } = require('../../utils/php-jobs');
const { uploadFile } = require('../../utils/uploads');
const tenants = require('../../db/tenant-connections');
const repository = require('./admin-customers.repository');
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
  runPhpScript('script_create_customer_db.php', [org.organisation_id]).catch((err) =>
    logger.error('customer provisioning failed', { organisationId: org.organisation_id, error: err.message }));

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

/* ------------------------------------------------------- account switches */

const listSwitches = (organisationId) => repository.listAccountProcesses(organisationId);
const setSwitch = ({ organisationId, buttonId, status }) =>
  repository.upsertAccountProcess({ organisationId, buttonId, status });

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
const normaliseNames = ({ organisationId, representativeIds, type, suggestions, fixedIdenticals }) => {
  runNodeScript('normalize_names.js', [
    organisationId,
    JSON.stringify(representativeIds || []),
    type,
    suggestions === undefined ? '' : suggestions,
    fixedIdenticals === undefined ? '' : fixedIdenticals,
  ]).catch((err) => logger.error('name normalisation failed', {
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
    runPhpScript('run_script_for_update_flag.php', [organisationId, JSON.stringify(companyIds)])
      .catch((err) => logger.error('flag update failed', { organisationId, error: err.message }));
  } else {
    runPhpScript('update_flag.php', [organisationId, companyIds[0] === undefined ? '' : companyIds[0]])
      .catch((err) => logger.error('flag update failed', { organisationId, error: err.message }));
  }
  return { message: 'Fixing flag in process' };
};

const runMissingConveyance = async ({ organisationId, companyId }) => {
  await requireCustomer(organisationId);
  runPhpScript('update_missing_type.php', [organisationId, companyId === undefined ? '' : companyId])
    .catch((err) => logger.error('conveyance fix failed', { organisationId, error: err.message }));
  return { message: 'Fixing conveyance in process' };
};

const findMissingInventors = async ({ organisationId, representativeId }) => {
  await requireCustomer(organisationId);
  const running = await repository.findInventorProcess({ organisationId, representativeId });
  if (running) return { message: 'Already in process.' };

  await repository.createInventorProcess({ organisationId, representativeId });
  runPhpScript('find_missing_from_api_inventor_xml.php', [organisationId, representativeId])
    .catch((err) => logger.error('inventor search failed', { organisationId, error: err.message }));
  return { message: 'Finding the number of assignments with a missing inventor.' };
};

const stopMissingInventors = async ({ organisationId, representativeId }) => {
  await repository.stopInventorProcess({ organisationId, representativeId });
  return { message: 'Stopped.' };
};

const publishCompanies = async (organisationId) => {
  const org = await requireCustomer(organisationId);
  await runPhpScript('update_client_companies.php', [organisationId, '']);
  return { message: 'UPDATED!', name: org.name };
};

const publishAddresses = async (organisationId) => {
  await requireCustomer(organisationId);
  await runPhpScript('update_client_companies_address.php', [organisationId, '']);
  return { message: 'UPDATED!' };
};

const createTree = async (organisationId) => {
  const org = await requireCustomer(organisationId);
  runPhpScript('tree_script.php', [org.name])
    .catch((err) => logger.error('tree script failed', { organisationId, error: err.message }));
  return { message: 'Tree build started' };
};

const retrieveCitedPatents = async ({ customerId, companies, type }) => {
  runNodeScript('retrieve_cited_patents_assignees.js', [customerId, companies, type])
    .catch((err) => logger.error('cited patents job failed', { customerId, error: err.message }));
  return { message: 'Run retrieved assignee script.' };
};

const retrieveCitedPatentDomains = async ({ customerId, apiName, assignees }) => {
  runNodeScript('name_to_domain_api.js', [customerId, apiName, assignees, 0])
    .catch((err) => logger.error('domain lookup failed', { customerId, error: err.message }));
  return { message: 'run domain script' };
};

const retrieveCitedPatentLogos = async (input) => {
  const { clientId, apiName, assignees, all, companyId, type, sourceData } = input;
  runNodeScript('name_to_domain_api.js', [
    clientId, apiName, assignees, 1, companyId, all, type, sourceData,
  ]).catch((err) => logger.error('logo download failed', { clientId, error: err.message }));
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
  runFlagUpdate,
  runMissingConveyance,
  findMissingInventors,
  stopMissingInventors,
  publishCompanies,
  publishAddresses,
  createTree,
  retrieveCitedPatents,
  retrieveCitedPatentDomains,
  retrieveCitedPatentLogos,
};
