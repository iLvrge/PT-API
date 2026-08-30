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

/**
 * Limiter for the endpoints reachable without a token — the share views, where
 * a six-character code is the only credential and would otherwise be
 * brute-forceable. Lives here rather than in the share module so every limiter
 * shares one policy, including the test skip: without it, the share suite's
 * own requests counted towards the limit and later tests saw 429s depending on
 * how many requests ran before them.
 */
const publicLimiter = rateLimit({
  windowMs: env.security.rateLimit.windowMs,
  max: env.security.rateLimit.publicMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
});

module.exports = {
  helmet: helmet(),
  cors: corsMiddleware,
  globalLimiter,
  authLimiter,
  publicLimiter,
};
