'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const repository = require('./client-users.repository');

const randomPassword = () => crypto.randomBytes(24).toString('base64url');

const requireAdmin = async (tenant, userId) => {
  const admin = await repository.findRequesterAdmin(tenant, userId);
  if (!admin) throw ApiError.forbidden('You are not authorized to perform this action');
  return admin;
};

const list = (tenant) => repository.listUsers(tenant);

/**
 * Create a client user across db_business (login) and the tenant DB (user +
 * professional). Unlike the legacy route the initial password is a random
 * secret, never the surname (audit F3); the user resets it via the normal flow.
 * File upload and Slack invite side-effects are not ported here.
 */
const create = async (tenant, requesterId, orgId, body) => {
  await requireAdmin(tenant, requesterId);

  // role/type mapping (legacy semantics)
  let type = '1';
  let roleId = 2;
  if (body.type === 0 || body.type === '0') {
    type = '0';
    roleId = 1;
  }
  if (body.role !== undefined && body.role > 0) {
    type = body.role === 1 ? '0' : '1';
    roleId = body.role;
  }

  const login = await repository.findLoginByEmail(body.email_address);
  if (login) throw ApiError.conflict('Email address already exists');

  const businessUser = await repository.createLogin({
    username: body.email_address,
    email_address: body.email_address,
    first_name: body.first_name,
    last_name: body.last_name,
    role_id: roleId,
    type,
    organisation_id: orgId,
    password: await bcrypt.hash(randomPassword(), env.auth.bcryptRounds),
  });

  const userId = businessUser.user_id;

  const clientUser = await repository.createUser(tenant, {
    user_id: userId,
    first_name: body.first_name,
    last_name: body.last_name,
    email_address: body.email_address,
    username: body.email_address,
    job_title: body.job_title,
    linkedin_url: body.person_linkedin_url,
    telephone1: body.telephone1,
    telephone: body.telephone,
    role_id: roleId,
    logo: '',
  });

  // Best-effort firm + professional creation, mirroring the legacy flow.
  const organisation = await repository.findOrganisation(orgId);
  if (organisation) {
    const firm = (await repository.findFirmByName(tenant, organisation.name)) ||
      (await repository.createFirm(tenant, organisation.name));
    const firmId = firm && (firm.firm_id || firm.get?.('firm_id'));
    if (firmId) {
      await repository.createProfessional(tenant, {
        first_name: body.first_name,
        last_name: body.last_name,
        email_address: body.email_address,
        job_title: body.job_title,
        linkedin_url: body.person_linkedin_url,
        telephone1: body.telephone1,
        telephone: body.telephone,
        type: 0,
        profile_logo: '',
        firm_id: firmId,
      });
    }
  }

  const json = clientUser.toJSON ? clientUser.toJSON() : clientUser;
  delete json.password;
  return json;
};

const update = async (tenant, requesterId, orgId, updateUserId, body) => {
  await requireAdmin(tenant, requesterId);

  const existing = await repository.findUser(tenant, updateUserId);
  if (!existing) throw ApiError.badRequest('Invalid inputs');

  if (body.password !== undefined) {
    await repository.updateLogin(updateUserId, {
      password: await bcrypt.hash(body.password, env.auth.bcryptRounds),
    });
  }
  if (body.status === 0 || body.status === 1) {
    await repository.updateLogin(updateUserId, { status: body.status });
  }

  const userUpdate = {
    first_name: body.first_name,
    last_name: body.last_name,
    email_address: body.email_address,
    linkedin_url: body.linkedin_url,
    job_title: body.job_title,
    telephone: body.telephone,
    telephone1: body.telephone1,
  };
  if (body.status === 0 || body.status === 1) userUpdate.status = body.status;

  let loginTypeUpdate = null;
  if (body.type === 'Admin') {
    loginTypeUpdate = { type: '0' };
    userUpdate.role_id = 1;
  } else if (body.type === 'Manager') {
    loginTypeUpdate = { type: '1' };
    userUpdate.role_id = 2;
  }
  if (body.role !== undefined && body.role > 0) {
    loginTypeUpdate = { type: body.role === 1 ? '0' : '1' };
    userUpdate.role_id = body.role;
  }

  await repository.updateUser(tenant, updateUserId, userUpdate);

  if (loginTypeUpdate) {
    loginTypeUpdate.first_name = body.first_name;
    loginTypeUpdate.last_name = body.last_name;
    if (body.email_address !== existing.email_address) loginTypeUpdate.email_address = body.email_address;
    loginTypeUpdate.job_title = body.job_title;
    await repository.updateLogin(updateUserId, loginTypeUpdate);
  }

  return { updated: true };
};

/**
 * Delete users across the tenant DB (activities + users) and db_business
 * (logins). Each database uses its own transaction; if the business delete
 * fails, the tenant rows are restored (compensating action), matching legacy.
 */
const deleteUsers = async (tenant, requesterId, userIds) => {
  await requireAdmin(tenant, requesterId);

  const targets = userIds.filter((id) => id !== requesterId);
  if (!targets.length) throw ApiError.badRequest('You cannot delete your own account or invalid users');

  const found = await repository.findUsersByIds(tenant, targets);
  if (!found.length) throw ApiError.badRequest('No valid users found to delete');
  const ids = found.map((u) => u.user_id);
  const backup = found.map((u) => ({ ...u }));

  await repository.tenantTransaction(tenant, async (t) => {
    await repository.destroyActivities(tenant, ids, { transaction: t });
    await repository.destroyUsers(tenant, ids, { transaction: t });
  });

  try {
    await repository.businessTransaction(async (t) => {
      await repository.destroyLogins(ids, { transaction: t });
    });
  } catch (_businessError) {
    // Compensate: restore the tenant rows we deleted.
    try {
      await repository.tenantTransaction(tenant, async (t) => {
        await repository.bulkCreateUsers(tenant, backup, { transaction: t });
      });
    } catch (_restoreError) {
      throw ApiError.internal('Failed to delete users and failed to roll back; manual repair needed');
    }
    throw ApiError.internal('Failed to delete users from login database');
  }

  return { deleted: ids };
};

module.exports = { list, create, update, deleteUsers, requireAdmin };
