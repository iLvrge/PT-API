'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./event-icons.controller');

const router = express.Router();

const idSchema = z.object({ params: z.object({ eventId: z.coerce.number().int().nonnegative() }) });

// Mounted at /events_icons. The whole set is ~430KB of markup, so a single-icon
// endpoint is offered alongside the legacy bulk response.
router.get('/', verifyToken, controller.all);
router.get('/:eventId', verifyToken, validate(idSchema), controller.byId);

module.exports = router;
