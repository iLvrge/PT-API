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

module.exports = { findByUsername };
