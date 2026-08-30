'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./search.controller');

const router = express.Router();
const guard = [verifyToken, attachTenant];

const searchSchema = z.object({
  params: z.object({ search_string: z.string().min(1).max(200) }),
});

// Mounted at /search. The legacy GET /:search_string/:type variant is not
// ported: it ran three expensive queries and then returned an empty list
// unconditionally, so it had no observable behaviour to preserve.
router.get('/:search_string', guard, validate(searchSchema), controller.transactions);

module.exports = router;
