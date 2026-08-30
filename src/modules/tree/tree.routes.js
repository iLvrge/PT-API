'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const controller = require('./tree.controller');

const router = express.Router();

// Mounted at /tree.
router.get('/', [verifyToken, attachTenant], controller.portfolio);

module.exports = router;
