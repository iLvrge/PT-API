'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const controller = require('./validity.controller');

const router = express.Router();

// Mounted at /. The tenant connection is required for parity with the legacy
// route, which returned zeros when the caller's database was unreachable.
router.get('/validity_counter', [verifyToken, attachTenant], controller.counters);

module.exports = router;
