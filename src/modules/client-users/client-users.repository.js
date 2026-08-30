'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');
const BusinessUser = require('../../db/models/user.model');

// ---- tenant reads ----
const listUsers = (tenant) =>
  q.selectAll(
    tenant,
    `SELECT user_id, first_name, last_name, job_title, email_address, logo,
            telephone, telephone1, role_id, 0 AS slack
       FROM user ORDER BY user_id`
  );

const findRequesterAdmin = (tenant, userId) =>
  q.selectOne(
    tenant,
    `SELECT user_id, role_id FROM user WHERE user_id = :userId AND role_id = 1 LIMIT 1`,
    { userId }
  );

const findUser = (tenant, userId) =>
  q.selectOne(tenant, `SELECT * FROM user WHERE user_id = :userId LIMIT 1`, { userId });

const findUsersByIds = (tenant, userIds) => {
  if (!userIds.length) return Promise.resolve([]);
  return q.selectAll(tenant, `SELECT * FROM user WHERE user_id IN (:userIds)`, { userIds });
};

// ---- tenant writes ----
const createUser = (tenant, data) => tenantModel(tenant, 'client_user').create(data);
const updateUser = (tenant, userId, data) =>
  tenantModel(tenant, 'client_user').update(data, { where: { user_id: userId } });
const bulkCreateUsers = (tenant, rows, options) => tenantModel(tenant, 'client_user').bulkCreate(rows, options);
const destroyUsers = (tenant, userIds, options) =>
  tenantModel(tenant, 'client_user').destroy({ where: { user_id: userIds }, ...options });
const destroyActivities = (tenant, userIds, options) =>
  tenantModel(tenant, 'activity').destroy({ where: { user_id: userIds }, ...options });

const findFirmByName = (tenant, firmName) =>
  q.selectOne(tenant, `SELECT firm_id FROM firm WHERE firm_name = :firmName LIMIT 1`, { firmName });
const createFirm = (tenant, firmName) => tenantModel(tenant, 'firm').create({ firm_name: firmName });
const createProfessional = (tenant, data) => tenantModel(tenant, 'professional').create(data);

const tenantTransaction = (tenant, fn) => tenant.transaction(fn);

// ---- business (db_business) ----
const findLoginByEmail = (email) =>
  q.selectOne(
    connections.business,
    `SELECT user_id FROM user WHERE username = :email AND email_address = :email LIMIT 1`,
    { email }
  );
const createLogin = (data) => BusinessUser.create(data);
const updateLogin = (userId, data) => BusinessUser.update(data, { where: { user_id: userId } });
const destroyLogins = (userIds, options) =>
  BusinessUser.destroy({ where: { user_id: userIds }, ...options });
const businessTransaction = (fn) => connections.business.transaction(fn);

const findOrganisation = (orgId) =>
  q.selectOne(connections.business, `SELECT organisation_id, name FROM organisation WHERE organisation_id = :orgId LIMIT 1`, {
    orgId,
  });

module.exports = {
  listUsers,
  findRequesterAdmin,
  findUser,
  findUsersByIds,
  createUser,
  updateUser,
  bulkCreateUsers,
  destroyUsers,
  destroyActivities,
  findFirmByName,
  createFirm,
  createProfessional,
  tenantTransaction,
  findLoginByEmail,
  createLogin,
  updateLogin,
  destroyLogins,
  businessTransaction,
  findOrganisation,
};
