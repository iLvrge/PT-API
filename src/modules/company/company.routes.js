'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const controller = require('./company.controller');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Mounted at /companies. Literal paths before :companyID.
router.post('/request', verifyToken, controller.addRequest);
router.get('/request', verifyToken, controller.listRequests);
router.get('/summary', guard, controller.summary);
router.get('/list', guard, controller.companyList);
router.get('/maintainence_assets', verifyToken, controller.maintainenceAssets);
router.get('/lawfirm', guard, controller.lawfirmMappings);
router.post('/lawfirm', guard, controller.addLawfirmMappings);
// The legacy delete path had no ':' so the id never bound (always 402); fixed.
router.delete('/lawfirm/:companyLawfirmId', guard, controller.removeLawfirmMapping);
router.get('/search/:searchName', verifyToken, controller.search);
router.post('/group', guard, controller.addGroup);
router.post('/', guard, controller.createCompanies);
router.delete('/subcompanies', guard, controller.deleteSubcompanies);
router.delete('/', guard, controller.deleteCompanies);
router.get('/', guard, controller.companiesWithChildren);
router.get('/:companyID/list', guard, controller.companyChildren);
router.get('/:companyID/users', guard, controller.companyUsers);
router.put('/:companyID', guard, controller.updateCompany);

module.exports = router;
