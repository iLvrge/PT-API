'use strict';

/**
 * User business logic. Pure of HTTP and SQL — it orchestrates the repository
 * and enforces rules, so it can be unit-tested with the repository mocked.
 *
 * Fixes carried over from the debugging session:
 *   - S1: last_name defaults to '' (NOT NULL column, optional in the UI).
 *   - F3: never derive a password from user data; require it explicitly.
 *   - S3: the delete removes the business record and reports honestly rather
 *     than failing when a downstream record is absent.
 */

const bcrypt = require('bcrypt');
const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const q = require('../../db/query');
const tenants = require('../../db/tenant-connections');
const logger = require('../../utils/logger');
const repository = require('./users.repository');

const ROLE_MANAGER = 1;
const ROLE_MEMBER = 2;
const TYPE_MANAGER = 0;

const toPublic = (row) => ({
  id: row.id ?? row.user_id,
  first_name: row.first_name,
  last_name: row.last_name,
  email_address: row.email_address,
  job_title: row.job_title ?? null,
  linkedin_url: row.linkedin_url ?? null,
  username: row.username ?? row.email_address,
  type: row.type,
  status: row.status ?? 0,
  role_name: row.role_name ?? null,
  created_at: row.created_at ?? null,
});

const list = async (organisationId) => {
  const rows = await repository.listByOrganisation(organisationId);
  return rows.map(toPublic);
};

const create = async (organisationId, input) => {
  if (await repository.existsByEmail(input.email_address)) {
    throw ApiError.conflict('A user with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, env.auth.bcryptRounds);

  const created = await repository.create({
    first_name: input.first_name,
    last_name: input.last_name || '', // S1: optional surname, NOT NULL column
    email_address: input.email_address,
    username: input.email_address,
    password: passwordHash, // F3: never derived from user data
    job_title: input.job_title || null,
    linkedin_url: input.linkedin_url || null,
    logo: input.logo || null,
    type: input.type,
    role_id: input.type === TYPE_MANAGER ? ROLE_MANAGER : ROLE_MEMBER,
    organisation_id: organisationId,
  });

  return toPublic(created.toJSON());
};

/**
 * Update a customer's user.
 *
 * A password change is exclusive: when `password` is present the legacy handler
 * wrote ONLY the hash and ignored every other field, and the console relies on
 * that — its "change password" dialog posts the password alone. Keeping the two
 * paths separate also means a profile edit can never blank a password.
 *
 * The same person exists twice: once in db_business (which owns sign-in) and
 * once in the customer's own tenant database (which owns their activity). The
 * business row is authoritative; if the tenant copy cannot be updated the edit
 * still stands and the divergence is logged, matching the legacy behaviour.
 */
const update = async (organisationId, userId, input) => {
  const existing = await repository.findByIdInOrganisation(userId, organisationId);
  if (!existing) throw ApiError.notFound('User not found');

  if (input.password) {
    const passwordHash = await bcrypt.hash(input.password, env.auth.bcryptRounds);
    await repository.updateById(userId, organisationId, { password: passwordHash });
    return { user_id: Number(userId), updated: ['password'] };
  }

  if (input.email_address && input.email_address !== existing.username
      && await repository.emailTakenByAnother(input.email_address, userId)) {
    throw ApiError.conflict('A user with this email already exists');
  }

  const attributes = {
    first_name: input.first_name,
    last_name: input.last_name || '',
    email_address: input.email_address,
    username: input.email_address,
    job_title: input.job_title || null,
    linkedin_url: input.linkedin_url || null,
    type: input.type,
    role_id: input.type === TYPE_MANAGER ? ROLE_MANAGER : ROLE_MEMBER,
  };
  await repository.updateById(userId, organisationId, attributes);
  await syncTenantUser(organisationId, existing.username, attributes);

  return { user_id: Number(userId), updated: Object.keys(attributes) };
};

/** Mirror a profile edit into the customer's own database. Best effort. */
const syncTenantUser = async (organisationId, currentUsername, attributes) => {
  try {
    const tenant = await tenants.getConnection(Number(organisationId));
    if (!tenant) return;

    const row = await q.selectOne(
      tenant,
      'SELECT user_id FROM user WHERE username = :username LIMIT 1',
      { username: currentUsername }
    );
    if (!row) return;

    await tenant.query(
      `UPDATE user SET first_name = :first_name, last_name = :last_name,
              email_address = :email_address, username = :username,
              job_title = :job_title, linkedin_url = :linkedin_url, role_id = :role_id
        WHERE user_id = :userId`,
      {
        replacements: {
          first_name: attributes.first_name,
          last_name: attributes.last_name,
          email_address: attributes.email_address,
          username: attributes.username,
          job_title: attributes.job_title,
          linkedin_url: attributes.linkedin_url,
          role_id: attributes.role_id,
          userId: row.user_id,
        },
        logging: false,
      }
    );
  } catch (err) {
    logger.warn('customer user updated in business but not in the tenant', {
      organisationId, error: err.message,
    });
  }
};

const remove = async (organisationId, userId) => {
  const user = await repository.findByIdInOrganisation(userId, organisationId);
  if (!user) throw ApiError.notFound('User not found');

  const deleted = await repository.destroyById(userId, organisationId);
  if (deleted === 0) throw ApiError.notFound('User not found');

  return { user_id: userId, deleted: true };
};

module.exports = { list, create, update, remove, toPublic };
