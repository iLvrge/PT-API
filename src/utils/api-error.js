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
  /**
   * `type` names a failure mode from the catalogue in utils/problem.js — the
   * key, not the URI. It is optional: without one the status decides, which is
   * right for most call sites. Set it where a caller would plausibly branch on
   * this particular failure rather than on the status, e.g. telling an unknown
   * share code apart from any other 404.
   */
  constructor(statusCode, message, { details = null, isOperational = true, type = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    this.type = type;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details, type) {
    return new ApiError(400, message, { details, type });
  }

  static unauthorized(message = 'Unauthorized', type) {
    return new ApiError(401, message, { type });
  }

  static forbidden(message = 'Forbidden', type) {
    return new ApiError(403, message, { type });
  }

  static notFound(message = 'Not found', type) {
    return new ApiError(404, message, { type });
  }

  static conflict(message = 'Conflict', details, type) {
    return new ApiError(409, message, { details, type });
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message, { isOperational: false });
  }

  /**
   * A dependency this request needed is not reachable — a tenant database, say.
   * Operational, so the message reaches the caller instead of being replaced
   * with a generic 500.
   */
  static serviceUnavailable(message = 'Service unavailable') {
    return new ApiError(503, message);
  }
}

module.exports = ApiError;
