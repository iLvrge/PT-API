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
router.get('/events', guard, validate(schema.eventsSchema), controller.events);
router.get('/asset_types', guard, validate(schema.assetTypesSchema), controller.assetTypeTabs);
router.get('/asset_types/companies', guard, validate(schema.companiesSchema), controller.assetTypeCompanies);
router.get('/asset_types/assignments', guard, validate(schema.assignmentsSchema), controller.assetTypeAssignments);
router.get('/asset_types/assignments/:rfID', guard, validate(schema.rfIdSchema), controller.assignmentAssets);
router.get('/asset_types/assets', guard, validate(schema.assetsSchema), controller.assetTypeAssets);
router.get('/asset_types/:tab_id/companies', guard, validate(schema.tabCompaniesSchema), controller.assetTypeTabCompanies);

router.post('/transactions/groupids', verifyToken, validate(schema.groupIdsSchema), controller.transactionsByGroupIds);
router.get('/transactions/address', verifyToken, validate(schema.transactionsQuerySchema), controller.transactionsAddress);
router.get('/transactions/name', verifyToken, validate(schema.transactionsQuerySchema), controller.transactionsName);
router.get('/incorrectnames', guard, validate(schema.incorrectNamesSchema), controller.incorrectNames);
router.post('/transactions/queues/address', guard, validate(schema.queueAddressSchema), controller.queueAddress);
router.post('/transactions/queues/name', guard, validate(schema.queueNameSchema), controller.queueName);
router.get('/lawfirm', guard, validate(schema.lawfirmSchema), controller.lawfirms);
router.get('/lenders', guard, validate(schema.lendersSchema), controller.lenders);
router.get('/portfolios', guard, validate(schema.portfoliosSchema), controller.portfolios);

// Parameterised routes LAST so they never shadow the literal paths above.
// (/:layout/assets, once ported, must be registered before /:rf_id/assets to
// preserve the legacy precedence in which the latter was shadowed.)
router.get('/:layout/parties', guard, validate(schema.layoutPartiesSchema), controller.layoutParties);
router.get('/:layout/activites', guard, validate(schema.layoutActivitiesSchema), controller.layoutActivities);
router.get('/:rf_id/assets', verifyToken, validate(schema.rfIdAssetsSchema), controller.rfIdAssets);

module.exports = router;
