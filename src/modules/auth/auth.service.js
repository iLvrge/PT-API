'use strict';

/**
 * Authentication logic. Sign-in verifies the password with bcrypt and issues a
 * signed JWT. Token refresh VERIFIES the incoming token's signature before
 * issuing a new one (audit finding F1 — the old code only base64-decoded it).
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const authRepository = require('./auth.repository');
const usersRepository = require('../users/users.repository');

const sign = (user) =>
  jwt.sign(
    {
      id: user.user_id,
      orgId: user.organisation_id,
      org_type: user.organisation_type,
      subscription: user.subscribtion,
    },
    env.auth.secret,
    { expiresIn: env.auth.tokenExpiresInSeconds }
  );

const signin = async ({ username, password }) => {
  const user = await authRepository.findByUsername(username);
  const invalid = ApiError.unauthorized('Incorrect username or password');

  if (!user) {
    // Spend comparable time hashing so response timing does not reveal which
    // usernames exist.
    await bcrypt.compare(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinva');
    throw invalid;
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw invalid;

  return { auth: true, accessToken: sign(user), message: 'Login successful' };
};

const refresh = async (token) => {
  if (!token) throw ApiError.unauthorized('Missing token');

  let payload;
  try {
    payload = jwt.verify(token, env.auth.secret); // F1: verify signature, never just decode
  } catch (_err) {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  // Re-issue only if the subject is still an active user.
  const user = await usersRepository.findActiveById(payload.id, payload.orgId);
  if (!user) throw ApiError.unauthorized('User is not authorized');

  return {
    auth: true,
    accessToken: sign({
      user_id: user.user_id,
      organisation_id: user.organisation_id,
      organisation_type: payload.org_type,
      subscribtion: payload.subscription,
    }),
    message: 'Token refreshed',
  };
};

module.exports = { signin, refresh, sign };
