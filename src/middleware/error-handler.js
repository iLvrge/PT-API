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
const logger = require('../utils/logger');

let Sentry = null;
try {
  // Optional — absent in tests and if the SDK is not installed.
  Sentry = require('@sentry/node');
} catch (_err) {
  Sentry = null;
}

const notFound = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

const normalise = (err) => {
  if (err instanceof ApiError) return err;

  switch (err.name) {
    case 'SequelizeValidationError':
    case 'SequelizeUniqueConstraintError': {
      const details = (err.errors || []).map((e) => ({ field: e.path, message: e.message }));
      const status = err.name === 'SequelizeUniqueConstraintError' ? 409 : 400;
      return new ApiError(status, 'Validation failed', { details });
    }
    case 'JsonWebTokenError':
    case 'TokenExpiredError':
      return ApiError.unauthorized('Invalid or expired token');
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
      method: req.method,
      url: req.originalUrl,
      status: apiError.statusCode,
      error: err.message,
      stack: err.stack,
    });
    if (Sentry && typeof Sentry.captureException === 'function') {
      Sentry.captureException(err);
    }
  }

  res.status(apiError.statusCode).json({
    error: {
      message: apiError.statusCode >= 500 ? 'Internal server error' : apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
  });
};

module.exports = { notFound, errorHandler };
