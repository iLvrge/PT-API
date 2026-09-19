'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

/** Look up an active user by username for sign-in. Raw read. */
const findByUsername = (username) =>
  q.selectOne(
    connections.business,
    `SELECT u.user_id, u.organisation_id, u.password, u.type, u.status,
            o.organisation_type, o.subscribtion
       FROM user AS u
       LEFT JOIN organisation AS o ON o.organisation_id = u.organisation_id
      WHERE u.username = :username AND u.status = 0
      LIMIT 1`,
    { username }
  );

/**
 * Look up an active ADMIN user by username. Raw read.
 *
 * `user.type` is enum('0','1','9'), so the literal must be quoted: an unquoted
 * `type = 9` is read as the 9th enum ordinal, which does not exist, and the
 * predicate silently matches no rows.
 */
const findAdminByUsername = (username) =>
  q.selectOne(
    connections.business,
    `SELECT user_id, organisation_id, password, type, status
       FROM user
      WHERE username = :username AND type = '9' AND status = 0
      LIMIT 1`,
    { username }
  );

module.exports = { findByUsername, findAdminByUsername };
