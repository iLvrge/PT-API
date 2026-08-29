'use strict';

/**
 * Express application assembly. Exported without listening so tests can mount
 * it directly with supertest (see tests/integration). server.js starts it.
 */

const express = require('express');
const { env } = require('./config/env');
const security = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/error-handler');

const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/users.routes');

const createApp = () => {
  const app = express();

  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(security.helmet);
  app.use(security.cors);
  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: env.jsonBodyLimit }));
  app.use(security.globalLimiter);

  // Routes
  app.use('/', healthRoutes);
  app.use('/', authRoutes);
  app.use('/admin', userRoutes);

  // 404 then centralised error handling — always last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
