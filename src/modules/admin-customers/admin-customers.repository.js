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

// db_uspto, not db_business — and the key column is process_id, not id.
const AccountProcess = connections.resources.define(
  'admin_account_process',
  {
    process_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organisation_id: { type: DataTypes.BIGINT, allowNull: false },
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

// db_uspto, not db_new_application — and the key column is process_id, like
// admin_account_process above.
const MissingInventorProcess = connections.resources.define(
  'missing_inventor_process',
  {
    process_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: false },
    representative_id: { type: DataTypes.INTEGER, allowNull: false },
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

/* -------------------------------------------------- manual inventor flag */

/**
 * Mark a set of assignors as employee-inventors, or clear the mark.
 *
 * Setting the flag also retypes the conveyance to 'employee': an assignment
 * from a named individual to their employer is an employment transfer, not a
 * sale, and the rest of the product reads convey_ty to decide that. Clearing it
 * leaves the conveyance alone, because the original type is not recoverable.
 */
const setEmployerAssign = ({ partyIds, flag }) => {
  const setEmployeeType = Number(flag) === 1;
  const sql = `
    UPDATE representative_assignment_conveyance
       SET employer_assign = :flag${setEmployeeType ? ', convey_ty = :conveyType' : ''}
     WHERE rf_id IN (SELECT rf_id FROM assignor WHERE assignor_and_assignee_id IN (:partyIds))`;
  const replacements = { flag, partyIds };
  if (setEmployeeType) replacements.conveyType = 'employee';
  return connections.resources.query(sql, { replacements, logging: false });
};

/** Record the parties as known inventors. Existing rows are left alone. */
const rememberInventors = (partyIds) =>
  connections.resources.query(
    `INSERT IGNORE INTO inventors (assignor_and_assignee_id) VALUES ${
      partyIds.map((_, i) => `(:p${i})`).join(', ')}`,
    {
      replacements: Object.fromEntries(partyIds.map((id, i) => [`p${i}`, id])),
      logging: false,
    }
  );

/* ---------------------------------------------- per-company report rows */

/**
 * The summary row per company, for the customer's company list.
 *
 * organisation_id is pinned to 0 here, matching the legacy helper: the roll-up
 * rows for individual companies are written under organisation 0, not under the
 * owning customer.
 */
const summaryForCompanies = (companyIds) =>
  q.selectAll(
    connections.resources,
    `SELECT company_id, companies, activities,
            entities AS no_of_entities, parties AS no_of_parties,
            employees AS no_of_employees, transactions AS no_of_transactions,
            assets AS assets, arrows AS product, 0 AS documents
       FROM summary
      WHERE organisation_id = 0 AND company_id IN (:companyIds)`,
    { companyIds }
  );

/** Latest update-log row per company. */
const latestUpdateLogByCompany = (companyIds) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT company_id, MAX(id) AS id, MAX(end_time) AS end_time
       FROM log_update_company
      WHERE company_id IN (:companyIds)
      GROUP BY company_id`,
    { companyIds }
  );

/** Latest family-assets log row per company. */
const latestFamilyLogByCompany = (companyIds) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT company_id, MAX(id) AS id,
            SUBSTRING_INDEX(GROUP_CONCAT(retrieved_assets ORDER BY id DESC), ',', 1) AS retrieved_assets
       FROM log_family_assets_messages
      WHERE company_id IN (:companyIds)
      GROUP BY company_id`,
    { companyIds }
  );

/* ------------------------------------------------------- asset lookup */

/** Does this number exist as a grant or an application? */
const assetExists = (asset, flag) => {
  const column = flag === 1 ? 'grant_doc_num = :asset'
    : flag === 0 ? 'appno_doc_num = :asset'
      : '(grant_doc_num = :asset OR appno_doc_num = :asset)';
  return q.exists(
    connections.resources,
    `SELECT 1 FROM documentid WHERE ${column} LIMIT 1`,
    { asset }
  );
};

/* ------------------------------------------------------- customer patents */

/**
 * Every asset number for a customer, newest grant year first.
 *
 * Two shapes: scoped to chosen companies (which live under organisation 0), or
 * to the whole customer. `number` is the grant number when there is one and the
 * application number otherwise; asset_type flags which.
 */
const customerPatents = ({ organisationId, representativeIds, direction }) => {
  const scoped = representativeIds.length > 0;
  const order = String(direction).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const sql = `
    SELECT CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL
                THEN appno_doc_num ELSE grant_doc_num END AS number,
           appno_doc_num AS application,
           CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type
      FROM assets
     WHERE ${scoped
        ? '(organisation_id = 0 OR organisation_id IS NULL) AND company_id IN (:representativeIds)'
        : 'organisation_id = :organisationId'}
       AND DATE_FORMAT(grant_date, '%Y') >= :year
     GROUP BY number, application
     ORDER BY asset_type ASC, ABS(number) ${order}`;
  return q.selectAll(connections.applicationNew, sql, {
    organisationId,
    representativeIds: scoped ? representativeIds : [0],
    year: new Date().getFullYear() - 24,
  });
};

/* ------------------------------------------------------ customer reports */

/**
 * The per-organisation totals shown on each dashboard row. Stored pre-aggregated
 * in db_uspto.summary; company_id = 0 is the organisation-wide roll-up.
 *
 * SUM() over a single row is kept from the legacy query so the response shape
 * (no_of_entities, no_of_parties, ...) stays byte-identical for the admin app.
 */
const summaryForOrganisation = (organisationId) =>
  q.selectOne(
    connections.resources,
    `SELECT organisation_id, companies, activities,
            SUM(entities) AS no_of_entities, SUM(parties) AS no_of_parties,
            employees, SUM(transactions) AS no_of_transactions,
            SUM(assets) AS assets, SUM(arrows) AS product, 0 AS documents
       FROM summary
      WHERE organisation_id = :organisationId AND company_id = 0`,
    { organisationId }
  );

/**
 * The same roll-up rows for many organisations at once, for the dashboard.
 *
 * The console asks for these one customer at a time, which is 330 requests on a
 * single page load — past the default rate limit and minutes of wall time. This
 * answers all of them in one query.
 */
const summariesForOrganisations = (organisationIds) =>
  q.selectAll(
    connections.resources,
    `SELECT organisation_id, companies, activities,
            SUM(entities) AS no_of_entities, SUM(parties) AS no_of_parties,
            employees, SUM(transactions) AS no_of_transactions,
            SUM(assets) AS assets, SUM(arrows) AS product, 0 AS documents
       FROM summary
      WHERE organisation_id IN (:organisationIds) AND company_id = 0
      GROUP BY organisation_id`,
    { organisationIds }
  );

/** Which of these organisations have a share link. */
const organisationsWithShareLink = (organisationIds) =>
  q.selectAll(
    connections.business,
    `SELECT DISTINCT organisation_id FROM share_link
      WHERE organisation_id IN (:organisationIds)`,
    { organisationIds }
  );

/** Whether a share link has been issued for this organisation. */
const hasShareLink = (organisationId) =>
  q.exists(
    connections.business,
    `SELECT 1 FROM share_link WHERE organisation_id = :organisationId LIMIT 1`,
    { organisationId }
  );

/* ------------------------------------------------------- account switches */

const findAccountProcess = (organisationId, buttonId) =>
  q.selectOne(
    connections.resources,
    `SELECT process_id, organisation_id, button_id, status FROM admin_account_process
      WHERE organisation_id = :organisationId AND button_id = :buttonId LIMIT 1`,
    { organisationId, buttonId }
  );

const listAccountProcesses = (organisationId) =>
  q.selectAll(
    connections.resources,
    `SELECT process_id, organisation_id, button_id, status FROM admin_account_process
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
    connections.resources,
    `SELECT process_id, status FROM missing_inventor_process
      WHERE organisation_id = :organisationId AND representative_id = :representativeId
        AND status = 0 LIMIT 1`,
    { organisationId, representativeId }
  );

/**
 * Start (or restart) a search for one company.
 *
 * missing_inventor_process has a UNIQUE index on
 * (organisation_id, representative_id), so a plain INSERT succeeds exactly once
 * per company and every later run fails on the constraint — the search could be
 * used once and never again. A finished row is reset to status 0 instead.
 */
const restartExisting = async (organisationId, representativeId) => {
  const existing = await q.selectOne(
    connections.resources,
    `SELECT process_id FROM missing_inventor_process
      WHERE organisation_id = :organisationId AND representative_id = :representativeId
      LIMIT 1`,
    { organisationId, representativeId }
  );
  if (!existing) return null;
  await MissingInventorProcess.update(
    { status: 0 },
    { where: { process_id: existing.process_id } }
  );
  return { process_id: existing.process_id, restarted: true };
};

const createInventorProcess = async ({ organisationId, representativeId }) => {
  const restarted = await restartExisting(organisationId, representativeId);
  if (restarted) return restarted;

  try {
    const created = await MissingInventorProcess.create({
      organisation_id: organisationId, representative_id: representativeId, status: 0,
    });
    return created.toJSON ? created.toJSON() : created;
  } catch (err) {
    // Two requests for the same company arriving together can both pass the
    // check above before either INSERT lands, so the second hits the UNIQUE
    // constraint. That's a concurrent restart, not an error — read back
    // whichever row won and reuse it.
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    const restartedByOther = await restartExisting(organisationId, representativeId);
    if (restartedByOther) return restartedByOther;
    throw err;
  }
};

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
  setEmployerAssign,
  rememberInventors,
  summaryForCompanies,
  latestUpdateLogByCompany,
  latestFamilyLogByCompany,
  assetExists,
  customerPatents,
  summaryForOrganisation,
  summariesForOrganisations,
  organisationsWithShareLink,
  hasShareLink,
  findAccountProcess,
  listAccountProcesses,
  upsertAccountProcess,
  findInventorProcess,
  createInventorProcess,
  stopInventorProcess,
};
