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

/*
 * Short-lived cache of the two lookups every authenticated request makes.
 *
 * Both are read-only and answer the same thing for the same user for as long
 * as their account stands, yet each cost a database round-trip on every call.
 * Over the tunnel used for local work that is 0.5-1 s apiece, and the admin
 * console fires four requests per click; even next to the database it is two
 * of the three queries most requests make. Sixty seconds means a user who is
 * disabled or demoted keeps access for at most a minute.
 */
const AUTH_CACHE_TTL_MS = 60 * 1000;
const authCache = new Map(); // key -> { value, expires }

// Off under test by default: the suites flip the mocked lookups between cases
// and expect each request to consult them. A test of the cache itself turns
// it on explicitly.
let cacheEnabled = !env.isTest;
const configureAuthCache = ({ enabled }) => { cacheEnabled = enabled; authCache.clear(); };

const cached = async (key, load) => {
  if (!cacheEnabled) return load();
  const hit = authCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await load();
  // Only a positive answer is kept: a missing user or a refused admin check
  // is re-asked next time, so a fix on the account takes effect at once.
  if (value) authCache.set(key, { value, expires: Date.now() + AUTH_CACHE_TTL_MS });
  return value;
};

/** Forget every cached lookup - for tests and for account changes. */
const resetAuthCache = () => authCache.clear();

/** Verify a bearer token and attach the caller to req.auth. */
const verifyToken = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-auth-token'];
  if (!bearer) throw ApiError.unauthorized('Missing authentication token', 'INVALID_TOKEN');

  let payload;
  try {
    payload = jwt.verify(bearer, env.auth.secret);
  } catch (_err) {
    throw ApiError.unauthorized('Invalid or expired token', 'INVALID_TOKEN');
  }

  const user = await cached(
    `user:${payload.id}:${payload.orgId}`,
    () => usersRepository.findActiveById(payload.id, payload.orgId)
  );
  if (!user) throw ApiError.unauthorized('User is not authorized to access this resource', 'INVALID_TOKEN');

  // req is unique per request; no concurrent writer exists here.
  // eslint-disable-next-line require-atomic-updates
  req.auth = {
    userId: user.user_id,
    orgId: user.organisation_id,
    type: user.type,
    orgType: payload.org_type,
    // share-link tokens carry a company restriction (legacy middleware parity)
    showOtherCompanies: payload.show_other_companies,
    shareCode: payload.share_code,
  };
  next();
});

/** Require the caller to be an admin (type 9). Must run after verifyToken. */
const requireAdmin = asyncHandler(async (req, res, next) => {
  if (!req.auth) throw ApiError.unauthorized();
  const isAdmin = await cached(`admin:${req.auth.userId}`, () => usersRepository.isAdmin(req.auth.userId));
  if (!isAdmin) throw ApiError.forbidden('Admin access required', 'ADMIN_REQUIRED');
  next();
});

module.exports = { verifyToken, requireAdmin, resetAuthCache, configureAuthCache };
