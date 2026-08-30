'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

/**
 * The logged-in user's profile: user + role name + organisation. All three
 * tables live in db_business (latin1), same connection, so a plain JOIN is
 * correct — no cross-charset handling needed here.
 */
const findProfile = (userId) =>
  q.selectOne(
    connections.business,
    `SELECT u.user_id AS id, u.first_name, u.last_name, u.email_address, u.logo, u.job_title,
            r.name AS role_name,
            o.organisation_id, o.name AS organisation_name, o.subscribtion,
            o.logo AS organisation_logo, o.organisation_type
       FROM user AS u
       LEFT JOIN role AS r ON r.role_id = u.role_id
       LEFT JOIN organisation AS o ON o.organisation_id = u.organisation_id
      WHERE u.user_id = :userId AND u.status = 0
      LIMIT 1`,
    { userId }
  );

module.exports = { findProfile };
