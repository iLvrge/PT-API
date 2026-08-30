'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./customers.controller');
const schema = require('./customers.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Mounted at /customers. More specific paths before parameterised ones.
router.get('/asset_types', guard, validate(schema.assetTypesSchema), controller.assetTypeTabs);
router.get('/asset_types/companies', guard, validate(schema.companiesSchema), controller.assetTypeCompanies);
router.get('/asset_types/:tab_id/companies', guard, validate(schema.tabCompaniesSchema), controller.assetTypeTabCompanies);

module.exports = router;
