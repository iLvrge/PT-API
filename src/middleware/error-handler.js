'use strict';

/**
 * Central error handler and 404 handler.
 *
 * - Operational ApiErrors return their status and a client-safe body.
 * - Sequelize validation / unique errors map to 400 / 409 with field detail
 *   (audit S1 — these used to be swallowed into a generic 402).
 * - Anything else is a 500; only 5xx / non-operational errors are reported to
 *   Sentry (audit F14 — the old interceptor captured every response >= 400).
 */

const ApiError = require('../utils/api-error');
const problem = require('../utils/problem');
const logger = require('../utils/logger');
const sentry = require('../config/sentry');

const notFound = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

const normalise = (err) => {
  if (err instanceof ApiError) return err;

  switch (err.name) {
    case 'SequelizeValidationError':
    case 'SequelizeUniqueConstraintError': {
      const details = (err.errors || []).map((e) => ({ field: e.path, message: e.message }));
      const unique = err.name === 'SequelizeUniqueConstraintError';
      return new ApiError(unique ? 409 : 400, 'Validation failed', {
        details,
        type: unique ? 'CONFLICT' : 'VALIDATION',
      });
    }
    case 'JsonWebTokenError':
    case 'TokenExpiredError':
      return ApiError.unauthorized('Invalid or expired token', 'INVALID_TOKEN');
    case 'SequelizeDatabaseError':
    case 'SequelizeConnectionError':
      return ApiError.internal('A database error occurred');
    default:
      return new ApiError(err.statusCode || 500, err.message || 'Internal server error', {
        isOperational: false,
      });
  }
};

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature.
const errorHandler = (err, req, res, next) => {
  const apiError = normalise(err);

  if (!apiError.isOperational || apiError.statusCode >= 500) {
    logger.error('unhandled error', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: apiError.statusCode,
      error: err.message,
      stack: err.stack,
    });
    sentry.captureException(err); // F14: only 5xx / non-operational reach Sentry
  }

  // Hide the message only for unexpected (non-operational) errors, which may
  // leak internals. Deliberate operational errors — including a 503 for an
  // unreachable tenant DB — keep their client-safe message.
  const clientMessage = apiError.isOperational ? apiError.message : 'Internal server error';

  // application/problem+json is what tells a generic client this body is an
  // error and not data. The body carries the pre-7807 `error` envelope too, so
  // callers that read error.message keep working until they migrate.
  res
    .status(apiError.statusCode)
    .type(problem.MEDIA_TYPE)
    .json(problem.fromApiError(apiError, req, { detail: clientMessage }));
};

module.exports = { notFound, errorHandler };
