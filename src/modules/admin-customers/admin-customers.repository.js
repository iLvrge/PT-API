'use strict';

const bcrypt = require('bcrypt');
const { DataTypes } = require('sequelize');
const { connections } = require('../../db');
const q = require('../../db/query');
const { env } = require('../../config/env');
const { REPORT_QUERIES, REPORT_EXPANSIONS, ADMIN_ORGANISATION_ID, ADMIN_TYPE, ADMIN_ROLE_ID } = require('./admin-customers.constants');

/* ----------------------------------------------------------- write models */

const Organisation = connections.business.define(
  'organisation',
  {
    organisation_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: true },
    organisation_type: { type: DataTypes.INTEGER, allowNull: true },
    subscribtion: { type: DataTypes.INTEGER, allowNull: true },
    country_id: { type: DataTypes.INTEGER, allowNull: true },
    logo: { type: DataTypes.STRING, allowNull: true },
    type: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'organisation', freezeTableName: true, underscored: true, timestamps: false }
);

const BusinessUser = connections.business.define(
  'user',
  {
    user_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    first_name: { type: DataTypes.STRING, allowNull: true },
    last_name: { type: DataTypes.STRING, allowNull: true },
    username: { type: DataTypes.STRING, allowNull: true },
    email_address: { type: DataTypes.STRING, allowNull: true },
    password: { type: DataTypes.STRING, allowNull: true },
    job_title: { type: DataTypes.STRING, allowNull: true },
    linkedin_url: { type: DataTypes.STRING, allowNull: true },
    logo: { type: DataTypes.STRING, allowNull: true },
    type: { type: DataTypes.STRING, allowNull: true },
    role_id: { type: DataTypes.INTEGER, allowNull: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'user', freezeTableName: true, underscored: true, timestamps: false }
);

const AccountProcess = connections.business.define(
  'admin_account_process',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: false },
    button_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'admin_account_process', freezeTableName: true, underscored: true, timestamps: false }
);

const UpdateLog = connections.applicationNew.define(
  'log_update_company',
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: true },
  },
  { tableName: 'log_update_company', freezeTableName: true, underscored: true, timestamps: false }
);

const MissingInventorProcess = connections.applicationNew.define(
  'missing_inventor_process',
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: false },
    representative_id: { type: DataTypes.BIGINT, allowNull: false },
    status: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'missing_inventor_process', freezeTableName: true, underscored: true, timestamps: false }
);

/* ------------------------------------------------------------- customers */

/** Every customer organisation. */
const listCustomers = () =>
  q.selectAll(
    connections.business,
    `SELECT organisation_id AS id, name, logo, organisation_type,
            0 AS share_url, 0 AS assets, 0 AS no_of_transactions,
            0 AS no_of_parties, 0 AS no_of_entities, 0 AS no_of_employees, 0 AS product
       FROM organisation WHERE type <> 2 ORDER BY name ASC`
  );

/** One customer, with its UUID rendered readable. */
const findCustomer = (organisationId) =>
  q.selectOne(
    connections.business,
    `SELECT BIN_TO_UUID(uuid) AS standard, organisation_id, name, subscribtion,
            organisation_type, address, team, phone_number, email_address, logo,
            linkedin_url, zipcode, city, state, country_id, type, status
       FROM organisation WHERE organisation_id = :organisationId LIMIT 1`,
    { organisationId }
  );

const findCustomerByName = (name) =>
  q.selectOne(
    connections.business,
    `SELECT organisation_id, name FROM organisation WHERE name = :name LIMIT 1`,
    { name }
  );

/** The tenant credentials, used to refuse deleting a provisioned customer. */
const customerDatabase = (organisationId) =>
  q.selectOne(
    connections.business,
    `SELECT org_host, org_db, org_usr, org_pass FROM organisation
      WHERE organisation_id = :organisationId LIMIT 1`,
    { organisationId }
  );

const createCustomer = (data) => Organisation.create(data);
const updateCustomer = (organisationId, data) =>
  Organisation.update(data, { where: { organisation_id: organisationId } });
const destroyCustomer = (organisationId) =>
  Organisation.destroy({ where: { organisation_id: organisationId } });

/** Give a newly created customer its public UUID. */
const assignUuid = (organisationId) =>
  connections.business.query(
    `UPDATE organisation SET uuid = UUID_TO_BIN(UUID()) WHERE organisation_id = :organisationId`,
    { replacements: { organisationId }, logging: false }
  );

/* ----------------------------------------------------------- admin users */

const listAdminUsers = () =>
  q.selectAll(
    connections.business,
    `SELECT user_id, first_name, last_name, username FROM user
      WHERE role_id = :roleId AND type = :type AND organisation_id = :orgId`,
    { roleId: ADMIN_ROLE_ID, type: ADMIN_TYPE, orgId: ADMIN_ORGANISATION_ID }
  );

const createAdminUser = ({ firstName, lastName, username, password }) =>
  BusinessUser.create({
    first_name: firstName,
    last_name: lastName,
    email_address: '',
    username,
    password: bcrypt.hashSync(password, env.auth.bcryptRounds),
    job_title: '',
    linkedin_url: '',
    type: ADMIN_TYPE,
    logo: '',
    role_id: ADMIN_ROLE_ID,
    organisation_id: ADMIN_ORGANISATION_ID,
  });

const findAdminUser = (userId) =>
  q.selectOne(
    connections.business,
    `SELECT user_id FROM user
      WHERE user_id = :userId AND organisation_id = :orgId AND type = :type LIMIT 1`,
    { userId, orgId: ADMIN_ORGANISATION_ID, type: ADMIN_TYPE }
  );

const updateAdminUser = (userId, { firstName, password }) =>
  BusinessUser.update(
    { first_name: firstName, password: bcrypt.hashSync(password, env.auth.bcryptRounds) },
    { where: { user_id: userId, organisation_id: ADMIN_ORGANISATION_ID, type: ADMIN_TYPE } }
  );

/* --------------------------------------------------------- customer users */

const findUserInOrganisation = (userId, organisationId) =>
  q.selectOne(
    connections.business,
    `SELECT user_id, organisation_id FROM user
      WHERE user_id = :userId AND organisation_id = :organisationId LIMIT 1`,
    { userId, organisationId }
  );

const destroyBusinessUser = (userId, transaction) =>
  BusinessUser.destroy({ where: { user_id: userId }, transaction });

/* ------------------------------------------------------------ report runs */

/**
 * One of the fixed reports. The table, the column and the layout all come from
 * REPORT_QUERIES; only the values are bound.
 */
const runReport = ({ queryNo, representativeName, companyId, organisationId }) => {
  const spec = REPORT_QUERIES[queryNo];
  if (!spec) return Promise.resolve([]);

  const repl = { representativeName, companyId, organisationId };
  let inner = `SELECT ${spec.column} FROM ${spec.table} WHERE `;
  if (spec.byName) inner += `representative_name = :representativeName AND `;
  inner += `company_id = :companyId AND organisation_id = :organisationId`;
  if (spec.layoutId !== undefined) {
    inner += ` AND layout_id = :layoutId`;
    repl.layoutId = spec.layoutId;
  }

  const expand = REPORT_EXPANSIONS[queryNo];
  return q.selectAll(connections.resources, expand ? expand(inner) : inner, repl);
};

/* -------------------------------------------------------------- log reads */

const updateLogs = (companyIds) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT l.*, (SELECT r.representative_name FROM db_uspto.representative AS r
                   WHERE r.representative_id = l.company_id LIMIT 1) AS representative_name
       FROM log_update_company AS l
      WHERE l.company_id IN (:companyIds) ORDER BY l.id DESC`,
    { companyIds }
  );

const destroyUpdateLogs = (companyIds) =>
  UpdateLog.destroy({ where: { company_id: companyIds } });

const familyLogs = ({ organisationId, companyIds }) => {
  const repl = { organisationId };
  if (companyIds.length) repl.companyIds = companyIds;
  return q.selectAll(
    connections.resources,
    `SELECT l.*, CONCAT(l.retrieved_assets, ' / ', l.total_assets) AS message,
            org.name, r.representative_name
       FROM db_new_application.log_family_assets_messages AS l
       INNER JOIN db_business.organisation AS org ON org.organisation_id = l.organisation_id
       INNER JOIN db_uspto.representative AS r ON r.representative_id = l.company_id
      WHERE l.organisation_id = :organisationId
      ${companyIds.length ? 'AND l.company_id IN (:companyIds)' : ''}
      ORDER BY l.id ASC`,
    repl
  );
};

const reclassifyLogs = ({ organisationId, companyIds }) => {
  const repl = { organisationId };
  if (companyIds.length) repl.companyIds = companyIds;
  return q.selectAll(
    connections.resources,
    `SELECT l.*, org.name, r.representative_name
       FROM db_new_application.log_messages AS l
       INNER JOIN db_business.organisation AS org ON org.organisation_id = l.organisation_id
       LEFT JOIN db_uspto.representative AS r ON r.representative_id = l.company_id
      WHERE l.organisation_id = :organisationId
      ${companyIds.length ? 'AND l.company_id IN (:companyIds)' : ''}
      ORDER BY l.id ASC`,
    repl
  );
};

const destroyLogMessages = (table, { organisationId, companyIds }) => {
  const repl = { organisationId };
  let sql = `DELETE FROM db_new_application.${table} WHERE organisation_id = :organisationId`;
  if (companyIds.length) {
    sql += ` AND company_id IN (:companyIds)`;
    repl.companyIds = companyIds;
  }
  return connections.resources.query(sql, { replacements: repl, logging: false });
};

/* ------------------------------------------------------- account switches */

const findAccountProcess = (organisationId, buttonId) =>
  q.selectOne(
    connections.business,
    `SELECT id, organisation_id, button_id, status FROM admin_account_process
      WHERE organisation_id = :organisationId AND button_id = :buttonId LIMIT 1`,
    { organisationId, buttonId }
  );

const listAccountProcesses = (organisationId) =>
  q.selectAll(
    connections.business,
    `SELECT id, organisation_id, button_id, status FROM admin_account_process
      WHERE organisation_id = :organisationId`,
    { organisationId }
  );

const upsertAccountProcess = async ({ organisationId, buttonId, status }) => {
  const existing = await findAccountProcess(organisationId, buttonId);
  if (existing) {
    await AccountProcess.update(
      { status },
      { where: { organisation_id: organisationId, button_id: buttonId } }
    );
    return { ...existing, status };
  }
  const created = await AccountProcess.create({
    organisation_id: organisationId, button_id: buttonId, status: 1,
  });
  return created.toJSON ? created.toJSON() : created;
};

/* ------------------------------------------------- missing-inventor runs */

const findInventorProcess = ({ organisationId, representativeId }) =>
  q.selectOne(
    connections.applicationNew,
    `SELECT id, status FROM missing_inventor_process
      WHERE organisation_id = :organisationId AND representative_id = :representativeId
        AND status = 0 LIMIT 1`,
    { organisationId, representativeId }
  );

const createInventorProcess = ({ organisationId, representativeId }) =>
  MissingInventorProcess.create({
    organisation_id: organisationId, representative_id: representativeId, status: 0,
  });

const stopInventorProcess = ({ organisationId, representativeId }) =>
  MissingInventorProcess.update(
    { status: 1 },
    { where: { organisation_id: organisationId, representative_id: representativeId, status: 0 } }
  );

module.exports = {
  connections,
  listCustomers,
  findCustomer,
  findCustomerByName,
  customerDatabase,
  createCustomer,
  updateCustomer,
  destroyCustomer,
  assignUuid,
  listAdminUsers,
  createAdminUser,
  findAdminUser,
  updateAdminUser,
  findUserInOrganisation,
  destroyBusinessUser,
  runReport,
  updateLogs,
  destroyUpdateLogs,
  familyLogs,
  reclassifyLogs,
  destroyLogMessages,
  findAccountProcess,
  listAccountProcesses,
  upsertAccountProcess,
  findInventorProcess,
  createInventorProcess,
  stopInventorProcess,
};
