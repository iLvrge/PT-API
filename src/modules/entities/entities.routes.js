'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./entities.controller');

const router = express.Router();

const searchSchema = z.object({
  params: z.object({
    search_string: z.string().min(1).max(200),
    type: z.coerce.number().int(),
  }),
});

// Mounted at /entity.
router.get('/search/:search_string/:type', verifyToken, validate(searchSchema), controller.search);

module.exports = router;
