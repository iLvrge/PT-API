'use strict';

/**
 * Sentry initialisation. No-ops when SENTRY_DSN is unset (e.g. tests, local dev)
 * so the rest of the app can call captureException unconditionally.
 *
 * Unlike the legacy setup, we do NOT capture every response >= 400 — only 5xx
 * and non-operational errors are reported, from the central error handler
 * (audit finding F14).
 */

const { env } = require('./env');
const logger = require('../utils/logger');

let Sentry = null;
let initialised = false;

const init = () => {
  if (initialised) return Sentry;
  initialised = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn || env.isTest) {
    return null;
  }

  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: env.nodeEnv,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    });
    logger.info('sentry initialised', { environment: env.nodeEnv });
  } catch (err) {
    logger.warn('sentry init failed', { error: err.message });
    Sentry = null;
  }
  return Sentry;
};

const captureException = (err) => {
  if (Sentry && typeof Sentry.captureException === 'function') {
    Sentry.captureException(err);
  }
};

const captureMessage = (message, level = 'warning') => {
  if (Sentry && typeof Sentry.captureMessage === 'function') {
    Sentry.captureMessage(message, level);
  }
};

const flush = (timeout = 2000) =>
  Sentry && typeof Sentry.flush === 'function' ? Sentry.flush(timeout) : Promise.resolve();

module.exports = { init, captureException, captureMessage, flush, get sdk() {
  return Sentry;
} };
