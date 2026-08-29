'use strict';

/**
 * Wraps an async route handler so a rejected promise is forwarded to Express's
 * error middleware instead of becoming an unhandled rejection.
 *
 * Audit finding F6: the old code let unhandled rejections reach a global
 * handler that called process.exit(1), turning one bad query into an outage.
 * Every handler here goes through this wrapper.
 *
 *   route.get('/x', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
