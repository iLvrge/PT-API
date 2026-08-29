'use strict';

/**
 * User data access. Demonstrates the read/write split precisely:
 *   - reads  → raw SQL SELECT via ../../db/query
 *   - writes → Sequelize model (../../db/models/user.model)
 *
 * The repository is the ONLY place that touches the database for users, so the
 * service and controller never see SQL or the ORM.
 */

const { connections } = require('../../db');
const q = require('../../db/query');
const User = require('../../db/models/user.model');

// ---- reads (raw SQL) ------------------------------------------------------

const listByOrganisation = (organisationId) =>
  q.selectAll(
    connections.business,
    `SELECT u.user_id AS id, u.first_name, u.last_name, u.email_address,
            u.job_title, u.linkedin_url, u.username, u.type, u.status,
            u.created_at, r.name AS role_name
       FROM user AS u
       LEFT JOIN role AS r ON r.role_id = u.role_id
      WHERE u.organisation_id = :organisationId
      ORDER BY u.user_id DESC`,
    { organisationId }
  );

const findActiveById = (userId, organisationId) =>
  q.selectOne(
    connections.business,
    `SELECT user_id, organisation_id, type, status
       FROM user
      WHERE user_id = :userId AND organisation_id = :organisationId AND status = 0
      LIMIT 1`,
    { userId, organisationId }
  );

const isAdmin = (userId) =>
  q.exists(
    connections.business,
    `SELECT 1 FROM user WHERE user_id = :userId AND type = 9 AND status = 0`,
    { userId }
  );

const existsByEmail = (email) =>
  q.exists(connections.business, `SELECT 1 FROM user WHERE username = :email`, { email });

const findByIdInOrganisation = (userId, organisationId) =>
  q.selectOne(
    connections.business,
    `SELECT user_id, first_name, last_name, email_address, organisation_id
       FROM user
      WHERE user_id = :userId AND organisation_id = :organisationId
      LIMIT 1`,
    { userId, organisationId }
  );

// ---- writes (Sequelize) ---------------------------------------------------

const create = (attributes, options = {}) => User.create(attributes, options);

const destroyById = (userId, organisationId, options = {}) =>
  User.destroy({ where: { user_id: userId, organisation_id: organisationId }, ...options });

module.exports = {
  listByOrganisation,
  findActiveById,
  isAdmin,
  existsByEmail,
  findByIdInOrganisation,
  create,
  destroyById,
  // exposed so the service can open a transaction on the same connection
  connection: connections.business,
};
