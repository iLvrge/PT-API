'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const controller = require('./tabs.controller');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Mounted at /tabs. Literal segments before parameterised ones.
router.get('/:tabID/companies/:companyID/customers/:customerID/transactions/:rfID', guard, controller.transactionAssets);
router.get('/:tabID/companies/:companyID/customers/:customerID', guard, controller.customerTransactions);
router.get('/:tabID/customers', guard, controller.customers);
router.get('/:tabID/companies/:companyID', guard, controller.companyCustomers);
router.get('/:tabID', guard, controller.companies);

module.exports = router;
