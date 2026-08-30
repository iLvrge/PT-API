'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./address.controller');
const schema = require('./address.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Specific path before the parameterised ones.
router.get('/address/companies', guard, validate(schema.companiesQuerySchema), controller.listCompanies);
router.get('/address', guard, validate(schema.companiesQuerySchema), controller.list);
router.post('/address', guard, validate(schema.createAddressSchema), controller.create);
router.put('/address/:addressId', guard, validate(schema.updateAddressSchema), controller.update);
router.delete('/address/:addressId', guard, validate(schema.addressIdSchema), controller.remove);

module.exports = router;
