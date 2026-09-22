'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

/**
 * Look up an active user by username for sign-in. Raw read.
 *
 * Usernames are not unique across organisations - `test` exists 325 times in
 * this database, once per customer - so `LIMIT 1` alone picks whichever row
 * the plan happens to reach first. That is not stable: it can change with the
 * chosen index, a restart, or a write to the table. Since the token carries
 * the organisation, an unstable pick means the same credentials can sign in
 * to a different customer's data from one attempt to the next.
 *
 * Ordering by user_id makes the choice deterministic - the oldest matching
 * account wins, which is the row this has been resolving to in practice.
 */
const findByUsername = (username) =>
  q.selectOne(
    connections.business,
    `SELECT u.user_id, u.organisation_id, u.password, u.type, u.status,
            o.organisation_type, o.subscribtion
       FROM user AS u
       LEFT JOIN organisation AS o ON o.organisation_id = u.organisation_id
      WHERE u.username = :username AND u.status = 0
      ORDER BY u.user_id
      LIMIT 1`,
    { username }
  );

/**
 * Look up an active ADMIN user by username. Raw read.
 *
 * `user.type` is enum('0','1','9'), so the literal must be quoted: an unquoted
 * `type = 9` is read as the 9th enum ordinal, which does not exist, and the
 * predicate silently matches no rows.
 *
 * Ordered for the same reason as findByUsername above: no admin name is
 * duplicated today, but nothing in the schema prevents it.
 */
const findAdminByUsername = (username) =>
  q.selectOne(
    connections.business,
    `SELECT user_id, organisation_id, password, type, status
       FROM user
      WHERE username = :username AND type = '9' AND status = 0
      ORDER BY user_id
      LIMIT 1`,
    { username }
  );

module.exports = { findByUsername, findAdminByUsername };
