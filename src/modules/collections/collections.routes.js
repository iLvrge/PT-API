'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./collections.controller');
const schema = require('./collections.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

router.get('/collections', guard, controller.list);
router.post('/collections', guard, validate(schema.createSchema), controller.create);
router.put('/collections/:collectionId', guard, validate(schema.updateSchema), controller.update);
router.delete('/collections/:collectionId', guard, validate(schema.collectionIdSchema), controller.remove);

module.exports = router;
