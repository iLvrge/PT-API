'use strict';

/**
 * Resolves the caller's organisation database connection and attaches it as
 * req.tenant. Must run after verifyToken (which sets req.auth.orgId).
 *
 * Unlike the legacy clientDBConnection.connect — which set req.connection_db to
 * null and let each handler silently return an empty result — a tenant that
 * cannot be reached is an explicit 503, so the client learns the difference
 * between "no data" and "your database is unavailable".
 */

const ApiError = require('../utils/api-error');
const asyncHandler = require('../utils/async-handler');
const { getConnection } = require('../db/tenant-connections');

const attachTenant = asyncHandler(async (req, res, next) => {
  if (!req.auth || !req.auth.orgId) throw ApiError.unauthorized();

  const connection = await getConnection(req.auth.orgId);
  if (!connection) {
    throw new ApiError(503, 'Organisation database is unavailable', { isOperational: true });
  }

  // req is unique per request; no concurrent writer exists here.
  // eslint-disable-next-line require-atomic-updates
  req.tenant = connection;
  next();
});

module.exports = { attachTenant };
