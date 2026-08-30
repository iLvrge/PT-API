'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./professionals.controller');
const schema = require('./professionals.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Mounted at /professionals.
router.get('/', guard, controller.list);
router.post('/', guard, validate(schema.createSchema), controller.create);
router.put('/:professionalId', guard, validate(schema.updateSchema), controller.update);
router.delete('/:professionalId', guard, validate(schema.professionalIdSchema), controller.remove);

module.exports = router;
