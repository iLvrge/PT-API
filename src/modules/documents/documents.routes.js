'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const controller = require('./documents.controller');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Mounted at /documents.
router.get('/auth_token', verifyToken, controller.authToken);
router.get('/profile', verifyToken, controller.profile);
router.get('/layout', verifyToken, controller.layouts);
router.get('/layout/:layout_id', verifyToken, controller.layoutTemplates);
router.post('/layout', verifyToken, controller.addTemplateToLayouts);
router.delete('/layout', verifyToken, controller.removeTemplateFromLayouts);
router.get('/repo_folder', verifyToken, controller.getRepoFolder);
router.put('/repo_folder', verifyToken, controller.setRepoFolder);
router.put('/template_folder', verifyToken, controller.setTemplateFolder);
router.post('/create_template_drive', verifyToken, controller.copyTemplate);
router.get('/drive', verifyToken, controller.driveList);

// XML / sheet generation tier - explicit 501s until ported (xmlbuilder2 +
// Google Sheets flows, ~900 legacy lines).
router.post('/downloadXML', verifyToken, controller.downloadXML);
router.post('/fixed_transaction_address/downloadXML', verifyToken, controller.fixedAddressXML);
router.post('/fixed_transaction_name/downloadXML', verifyToken, controller.fixedNameXML);
router.post('/create_maintainence_file', verifyToken, controller.createMaintainenceFile);
router.post('/product_sheet', verifyToken, controller.productSheet);
router.post('/sheet', verifyToken, controller.sheet);
router.post('/sheet/:type/url', verifyToken, controller.sheetUrl);
router.put('/sheet/:type', verifyToken, controller.sheetUpdate);
router.post('/sheet/:type/:asset', verifyToken, controller.sheetByAsset);
router.post('/transaction', verifyToken, controller.transactionDoc);

// tenant document CRUD
router.get('/', guard, controller.listDocuments);
router.post('/', guard, controller.createDocument);
router.put('/:document_id', guard, controller.updateDocument);
router.delete('/:document_id', guard, controller.deleteDocument);

module.exports = router;
