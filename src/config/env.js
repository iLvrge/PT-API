'use strict';

/**
 * Central environment loader and validator.
 *
 * Fails fast at boot when a required variable is missing, instead of silently
 * falling back to a committed default (audit finding F2 — the JWT secret used
 * to fall back to a literal in the repository).
 *
 * Import this module before anything that reads process.env for config.
 */

const REQUIRED = [
  'HOST',
  'USER',
  'PASSWORD',
  'DATABASE_APPLICATION',
  'DATABASE_APPLICATION_NEW',
  'DATABASE_BUSINESS',
  'DATABASE_RAW',
  'SECRET',
];

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const toBool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
};

const validate = () => {
  const missing = REQUIRED.filter((key) => !process.env[key] || process.env[key].trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Refusing to boot with insecure defaults.'
    );
  }
  // Never allow the historical hardcoded secret to slip through.
  if (process.env.SECRET === 'p@nt3nt8@60') {
    throw new Error('SECRET is set to the known committed value; rotate it before booting.');
  }
};

// Validate immediately on require in non-test environments. Tests set their own
// env in tests/helpers/env.js before requiring anything, and may skip DB vars.
if (process.env.NODE_ENV !== 'test') {
  validate();
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: toInt(process.env.PORT, 4200),

  db: {
    host: process.env.HOST,
    user: process.env.USER,
    password: process.env.PASSWORD,
    names: {
      application: process.env.DATABASE_APPLICATION,
      applicationNew: process.env.DATABASE_APPLICATION_NEW,
      business: process.env.DATABASE_BUSINESS,
      resources: process.env.DATABASE_RAW,
      maintainence: process.env.DATABASE_MAINTAINENCE,
      biblioGrant: process.env.DATABASE_GRANT_BIBLIO,
      biblioApplication: process.env.DATABASE_APPLICATION_BIBLIO,
    },
    pool: {
      max: toInt(process.env.DB_POOL_MAX, 20),
      min: toInt(process.env.DB_POOL_MIN, 2),
      acquire: toInt(process.env.DB_POOL_ACQUIRE, 30000),
      idle: toInt(process.env.DB_POOL_IDLE, 10000),
    },
    logging: toBool(process.env.DB_QUERY_LOG, false),
  },

  auth: {
    secret: process.env.SECRET,
    tokenExpiresInSeconds: toInt(process.env.TOKEN_TTL_SECONDS, 86400),
    bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12),
  },

  security: {
    // Comma-separated allowlist. Empty ⇒ reflect no cross-origin (same-origin only).
    corsOrigins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimit: {
      windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      max: toInt(process.env.RATE_LIMIT_MAX, 300),
      authMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 10),
    },
  },

  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
};

module.exports = { env, validate, REQUIRED };
