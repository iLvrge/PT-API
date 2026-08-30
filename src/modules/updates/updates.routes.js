'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const controller = require('./updates.controller');

const router = express.Router();

// Mounted at /.
router.get('/updates/:companyName', [verifyToken, attachTenant], controller.counters);

module.exports = router;
