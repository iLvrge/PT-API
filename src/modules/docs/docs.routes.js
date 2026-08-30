'use strict';

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('../../docs/openapi');
const controller = require('./docs.controller');

const router = express.Router();

router.get('/docs.json', controller.getSpec);
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));

module.exports = router;
