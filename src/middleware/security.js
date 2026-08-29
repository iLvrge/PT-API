'use strict';

/**
 * Security middleware: helmet, a CORS allowlist, and rate limiters.
 *
 * Audit finding F12: the old app used bare cors() (Access-Control-Allow-Origin: *
 * on authenticated routes), no helmet, and no rate limiting anywhere.
 */

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const ApiError = require('../utils/api-error');

const corsMiddleware = cors({
  origin(origin, callback) {
    // Non-browser clients (no Origin) and same-origin requests are allowed.
    if (!origin) return callback(null, true);
    if (env.security.corsOrigins.length === 0) return callback(null, false);
    if (env.security.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new ApiError(403, `Origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

const globalLimiter = rateLimit({
  windowMs: env.security.rateLimit.windowMs,
  max: env.security.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
});

// Stricter limiter for auth endpoints (login, password reset, code verification).
const authLimiter = rateLimit({
  windowMs: env.security.rateLimit.windowMs,
  max: env.security.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: { message: 'Too many attempts, please try again later.' } },
});

module.exports = {
  helmet: helmet(),
  cors: corsMiddleware,
  globalLimiter,
  authLimiter,
};
