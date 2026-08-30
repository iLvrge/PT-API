'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./charts.controller');
const schema = require('./charts.validation');

const router = express.Router();

// Mounted at /charts -> GET /charts/:type
router.get('/:type', verifyToken, attachTenant, validate(schema.chartSchema), controller.getChart);

module.exports = router;
