'use strict';

/**
 * Express application assembly. Exported without listening so tests can mount
 * it directly with supertest (see tests/integration). server.js starts it.
 */

const express = require('express');
const fileUpload = require('express-fileupload');
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
const addressRoutes = require('./modules/address/address.routes');
const categoryProductRoutes = require('./modules/category-products/category-products.routes');
const collectionRoutes = require('./modules/collections/collections.routes');
const professionalRoutes = require('./modules/professionals/professionals.routes');
const commentRoutes = require('./modules/comments/comments.routes');
const activityRoutes = require('./modules/activities/activities.routes');
const selectionRoutes = require('./modules/selections/selections.routes');
const chartRoutes = require('./modules/charts/charts.routes');
const clientUserRoutes = require('./modules/client-users/client-users.routes');
const customerRoutes = require('./modules/customers/customers.routes');
const tabRoutes = require('./modules/tabs/tabs.routes');
const companyRoutes = require('./modules/company/company.routes');
const documentRoutes = require('./modules/documents/documents.routes');
const dashboardRoutes = require('./modules/dashboards/dashboards.routes');
const entityRoutes = require('./modules/entities/entities.routes');
const validityRoutes = require('./modules/validity/validity.routes');
const transactionRoutes = require('./modules/transactions/transactions.routes');
const updateRoutes = require('./modules/updates/updates.routes');
const searchRoutes = require('./modules/search/search.routes');
const treeRoutes = require('./modules/tree/tree.routes');
const adminTreeRoutes = require('./modules/admin-tree/admin-tree.routes');
const illustrationRoutes = require('./modules/illustration/illustration.routes');
const shareRoutes = require('./modules/share/share.routes');
const timelineRoutes = require('./modules/timelines/timelines.routes');
const eventIconRoutes = require('./modules/event-icons/event-icons.routes');
const externalRoutes = require('./modules/external/external.routes');
const assetRoutes = require('./modules/assets/assets.routes');
const microsoftRoutes = require('./modules/microsoft/microsoft.routes');
const slackRoutes = require('./modules/slack/slack.routes');
const familyRoutes = require('./modules/family/family.routes');

const createApp = () => {
  const app = express();

  // A hop count, not `true` — see env.security.trustProxyHops.
  app.set('trust proxy', env.security.trustProxyHops);
  app.disable('x-powered-by');

  app.use(security.helmet);
  app.use(security.cors);
  app.use(requestLogger);
  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: env.jsonBodyLimit }));
  // Multipart uploads land on req.files (documents, comments, admin tree).
  // abortOnLimit rejects an oversized body instead of buffering it whole.
  app.use(
    fileUpload({
      useTempFiles: false,
      tempFileDir: env.uploads.tempDir,
      limits: { fileSize: env.uploads.maxBytes },
      abortOnLimit: true,
      createParentPath: true,
    })
  );
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
  app.use('/', addressRoutes);
  app.use('/category_products', categoryProductRoutes);
  app.use('/', collectionRoutes);
  app.use('/professionals', professionalRoutes);
  app.use('/', commentRoutes);
  app.use('/', activityRoutes);
  app.use('/', selectionRoutes);
  app.use('/charts', chartRoutes);
  app.use('/users', clientUserRoutes);
  app.use('/customers', customerRoutes);
  app.use('/tabs', tabRoutes);
  app.use('/companies', companyRoutes);
  app.use('/documents', documentRoutes);
  app.use('/dashboards', dashboardRoutes);
  app.use('/entity', entityRoutes);
  app.use('/search', searchRoutes);
  app.use('/tree', treeRoutes);
  app.use('/', validityRoutes);
  app.use('/', transactionRoutes);
  app.use('/', updateRoutes);
  app.use('/', illustrationRoutes);
  app.use('/', shareRoutes);
  app.use('/timeline', timelineRoutes);
  app.use('/events_icons', eventIconRoutes);
  app.use('/', externalRoutes);
  app.use('/', assetRoutes);
  app.use('/microsoft', microsoftRoutes);
  app.use('/slacks', slackRoutes);
  app.use('/', familyRoutes);
  app.use('/admin', adminAuthRoutes);
  app.use('/admin', userRoutes);
  app.use('/admin', keywordRoutes);
  app.use('/admin', adminTreeRoutes);
  listModules.routers.forEach((r) => app.use('/admin', r));

  // 404 then centralised error handling — always last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
