'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./transactions.controller');

const router = express.Router();

const detailSchema = z.object({
  params: z.object({ transactionId: z.coerce.number().int().positive() }),
});

// Mounted at /.
router.get('/transactions', [verifyToken, attachTenant], controller.counters);
router.get('/transactions/:transactionId', verifyToken, validate(detailSchema), controller.detail);

module.exports = router;
