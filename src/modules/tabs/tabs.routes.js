'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const controller = require('./tabs.controller');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Mounted at /tabs. Literal segments before parameterised ones.
router.get('/:tab_id/companies/:company_id/customers/:customer_id/transactions/:rf_id', guard, controller.transactionAssets);
router.get('/:tab_id/companies/:company_id/customers/:customer_id', guard, controller.customerTransactions);
router.get('/:tab_id/customers', guard, controller.customers);
router.get('/:tab_id/companies/:company_id', guard, controller.companyCustomers);
router.get('/:tab_id', guard, controller.companies);

module.exports = router;
