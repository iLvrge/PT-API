'use strict';

/**
 * Operational error with an HTTP status and a client-safe message.
 *
 * `isOperational` distinguishes errors we deliberately threw (bad input, not
 * found, forbidden) from unexpected bugs. The central error handler reports
 * only non-operational / 5xx errors to Sentry (audit finding F14 — the old
 * code captured every response >= 400, including validation and 404).
 */
class ApiError extends Error {
  constructor(statusCode, message, { details = null, isOperational = true } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, { details });
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict', details) {
    return new ApiError(409, message, { details });
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message, { isOperational: false });
  }
}

module.exports = ApiError;
