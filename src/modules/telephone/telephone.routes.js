'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./telephone.controller');
const schema = require('./telephone.validation');

const router = express.Router();

// Applied per-route (not router.use) so that, mounted at '/', this router does
// not intercept unrelated paths — unmatched requests fall through to the 404
// handler instead of being challenged for auth.
const guard = [verifyToken, attachTenant];

router.get('/telephone', guard, validate(schema.listTelephoneSchema), controller.list);
router.post('/telephone', guard, validate(schema.createTelephoneSchema), controller.create);
router.delete('/telephone/:telephoneId', guard, validate(schema.telephoneIdSchema), controller.remove);

module.exports = router;
