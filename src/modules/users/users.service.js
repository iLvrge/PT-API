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

const remove = async (organisationId, userId) => {
  const user = await repository.findByIdInOrganisation(userId, organisationId);
  if (!user) throw ApiError.notFound('User not found');

  const deleted = await repository.destroyById(userId, organisationId);
  if (deleted === 0) throw ApiError.notFound('User not found');

  return { user_id: userId, deleted: true };
};

module.exports = { list, create, remove, toPublic };
