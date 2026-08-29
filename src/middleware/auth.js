'use strict';

/**
 * Authentication middleware.
 *
 * Audit finding F1: the old /refresh-token decoded the JWT payload WITHOUT
 * verifying its signature, letting anyone mint a token for any user. Here every
 * token is verified with jwt.verify against the configured secret, and the
 * identity is taken only from the verified payload.
 */

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const ApiError = require('../utils/api-error');
const asyncHandler = require('../utils/async-handler');
const usersRepository = require('../modules/users/users.repository');

/** Verify a bearer token and attach the caller to req.auth. */
const verifyToken = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-auth-token'];
  if (!bearer) throw ApiError.unauthorized('Missing authentication token');

  let payload;
  try {
    payload = jwt.verify(bearer, env.auth.secret);
  } catch (_err) {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await usersRepository.findActiveById(payload.id, payload.orgId);
  if (!user) throw ApiError.unauthorized('User is not authorized to access this resource');

  // req is unique per request; no concurrent writer exists here.
  // eslint-disable-next-line require-atomic-updates
  req.auth = {
    userId: user.user_id,
    orgId: user.organisation_id,
    type: user.type,
    orgType: payload.org_type,
  };
  next();
});

/** Require the caller to be an admin (type 9). Must run after verifyToken. */
const requireAdmin = asyncHandler(async (req, res, next) => {
  if (!req.auth) throw ApiError.unauthorized();
  const isAdmin = await usersRepository.isAdmin(req.auth.userId);
  if (!isAdmin) throw ApiError.forbidden('Admin access required');
  next();
});

module.exports = { verifyToken, requireAdmin };
