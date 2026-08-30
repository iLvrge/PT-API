'use strict';

/**
 * Express application assembly. Exported without listening so tests can mount
 * it directly with supertest (see tests/integration). server.js starts it.
 */

const express = require('express');
const { env } = require('./config/env');
const security = require('./middleware/security');
const requestLogger = require('./middleware/request-logger');
const { notFound, errorHandler } = require('./middleware/error-handler');
const docsRoutes = require('./modules/docs/docs.routes');

const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const adminAuthRoutes = require('./modules/auth/auth.admin.routes');
const userRoutes = require('./modules/users/users.routes');
const keywordRoutes = require('./modules/keywords/keywords.routes');
const listModules = require('./modules/lists');
const profileRoutes = require('./modules/profile/profile.routes');
const telephoneRoutes = require('./modules/telephone/telephone.routes');
const lawfirmRoutes = require('./modules/lawfirm/lawfirm.routes');
const lawfirmAddressRoutes = require('./modules/lawfirm-address/lawfirm-address.routes');

const createApp = () => {
  const app = express();

  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(security.helmet);
  app.use(security.cors);
  app.use(requestLogger);
  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: env.jsonBodyLimit }));
  app.use(security.globalLimiter);

  // API documentation
  app.use('/', docsRoutes);

  // Routes
  app.use('/', healthRoutes);
  app.use('/', authRoutes);
  app.use('/', profileRoutes);
  app.use('/', telephoneRoutes);
  app.use('/', lawfirmRoutes);
  app.use('/', lawfirmAddressRoutes);
  app.use('/admin', adminAuthRoutes);
  app.use('/admin', userRoutes);
  app.use('/admin', keywordRoutes);
  listModules.routers.forEach((r) => app.use('/admin', r));

  // 404 then centralised error handling — always last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
