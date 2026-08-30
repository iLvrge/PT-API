'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./assets.controller');

const router = express.Router();
const guard = [verifyToken, attachTenant];

const cpcCellSchema = z.object({
  params: z.object({
    year: z.string().regex(/^\d{4}$/, 'expected a four-digit year'),
    cpcCode: z.string().min(1).max(30),
  }),
});
const assetSchema = z.object({ params: z.object({ asset: z.string().min(1).max(50) }) });
const outsourceSchema = z.object({
  params: z.object({
    patentNumber: z.string().min(1).max(50),
    type: z.enum(['0', '1']),
  }),
});
const itemSchema = z.object({ params: z.object({ itemID: z.coerce.number().int().positive() }) });

// Mounted at /. Literal segments are declared before the parameterised
// /assets/:asset so it cannot swallow them.
router.get('/assets', verifyToken, controller.list);
router.get('/assets/download/:itemID', verifyToken, validate(itemSchema), controller.download);

router.post('/assets/categories_products', guard, controller.grantYears);
router.post('/assets/cpc', guard, controller.cpcBreakdown);
router.post('/assets/cpc/:year/:cpcCode', guard, validate(cpcCellSchema), controller.cpcCellAssets);
router.post('/assets/move', verifyToken, controller.move);
router.post('/assets/validate', verifyToken, controller.validate);
router.post('/assets/assets_for_sale', guard, controller.listForSale);
router.delete('/assets/rollback', verifyToken, controller.rollback);

// GET /assets/:patentNumber/:type/outsource had no authentication at all in the
// legacy app — its middleware array was left empty. It requires a token here.
router.get('/assets/:patentNumber/:type/outsource', verifyToken, validate(outsourceSchema), controller.outsource);
router.get('/assets/:asset', verifyToken, validate(assetSchema), controller.illustration);

// Slack file sharing — pending the messaging tier.
router.get(
  '/assets/:patentNumber/files/:channelID/slack/:token',
  verifyToken,
  controller.notPorted('Slack file sharing')
);

// The external-asset spreadsheets — pending the reporting tier. Six endpoints
// that all drive a Google Sheet through the sheets helper.
const sheets = controller.notPorted('External asset spreadsheets');
router.post('/assets/external_assets', guard, sheets);
router.put('/assets/external_assets', guard, sheets);
router.patch('/assets/external_assets', guard, sheets);
router.delete('/assets/external_assets', guard, sheets);
router.post('/assets/external_assets/sheets', guard, sheets);
router.post('/assets/external_assets/sheets/assets', guard, sheets);
router.post('/assets/external_assets/sheets/timeline', verifyToken, sheets);

// POST /assets/search is not ported here: it duplicates GET /search, which
// already covers company, counterparty, transaction and asset search.

module.exports = router;
