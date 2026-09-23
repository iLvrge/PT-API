'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./client-users.controller');
const schema = require('./client-users.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Mounted at /users.
router.get('/', guard, controller.list);
router.post('/', guard, validate(schema.createSchema), controller.create);
router.post('/invite', verifyToken, controller.invite);
router.put('/:user_id', guard, validate(schema.updateSchema), controller.update);
router.delete('/', guard, validate(schema.listQuerySchema), controller.removeMany);
router.delete('/:user_id', guard, validate(schema.userIdSchema), controller.removeOne);

module.exports = router;
