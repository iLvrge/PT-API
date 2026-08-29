'use strict';

/**
 * Process bootstrap: build the app, start listening, and shut down gracefully.
 *
 * Audit finding F6: unhandled rejections here are logged and reported, NOT used
 * to exit the process. A single bad background query must not take the API down
 * for every tenant.
 */

require('dotenv').config();

const sentry = require('./config/sentry');
sentry.init(); // must run before the app is built

const createApp = require('./app');
const { env } = require('./config/env');
const { closeAll } = require('./db');
const { closeAll: closeTenants } = require('./db/tenant-connections');
const logger = require('./utils/logger');

const app = createApp();
let server = null;

const start = () => {
  server = app.listen(env.port, '0.0.0.0', () => {
    logger.info('server started', { port: env.port, env: env.nodeEnv });
  });
};

const shutdown = async (signal) => {
  logger.info('shutting down', { signal });
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await Promise.all([closeAll(), closeTenants(), sentry.flush(2000)]);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Log and report, but keep serving. Do not exit on a single async error.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason: reason && reason.message ? reason.message : reason });
  sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
});
process.on('uncaughtException', (err) => {
  // An uncaught exception leaves the process in an unknown state — here we do
  // exit, but only after logging, and only for genuinely uncaught errors.
  logger.error('uncaughtException', { error: err.message, stack: err.stack });
  shutdown('uncaughtException').catch(() => process.exit(1));
});

if (require.main === module) {
  start();
}

module.exports = { app, start, shutdown };
