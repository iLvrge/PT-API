'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./events.controller');

const router = express.Router();
const guard = [verifyToken, attachTenant];

const assetNumber = z.string().min(1).max(50).regex(/^[A-Za-z0-9]+$/, 'expected an asset number');
const tabSchema = z.object({ params: z.object({ tab_id: z.coerce.number().int() }) });
const rfIdSchema = z.object({ params: z.object({ rf_id: z.coerce.number().int().positive() }) });
const applicationSchema = z.object({ params: z.object({ application_number: assetNumber }) });
const applicationPatentSchema = z.object({
  params: z.object({ application_number: assetNumber, patent_number: assetNumber }),
});

// Mounted at /. Literal segments come before the parameterised ones so
// /events/:applicationNumber cannot swallow them.
router.get('/events/tabs', verifyToken, controller.lifeSpanForSelection);
router.get('/events/tabs/:tab_id', guard, validate(tabSchema), controller.tabLifeSpan);
router.get('/events/tabs/:tab_id/companies/:company_id', guard, validate(tabSchema), controller.tabLifeSpan);
router.get('/events/tabs/:tab_id/companies/:company_id/customers/:customer_id', guard, validate(tabSchema), controller.tabLifeSpan);
router.get('/events/tabs/:tab_id/companies/:representative_id/customers/:customer_id/transactions/:rf_id', guard, validate(tabSchema), controller.tabLifeSpan);

router.post('/events/abandoned/maintainence/assets', verifyToken, controller.maintenanceAbandonment);
router.post('/events/abandoned/yearly/assets', verifyToken, controller.yearlyAbandonment);
router.post('/events/assets', verifyToken, controller.lifeSpanForAssets);

router.get('/events/all/assets/to_record/detail/:application', verifyToken, controller.assetToRecordDetail);
router.get('/events/all/assets/:category_type', verifyToken, controller.assetsByCategory);
router.get('/events/assets/status/:application_number', verifyToken, validate(applicationSchema), controller.assetStatus);
router.get('/events/assets/transactions/:rf_id', verifyToken, validate(rfIdSchema), controller.transactionAssets);

router.get('/events/:application_number/:patent_number', verifyToken, validate(applicationPatentSchema), controller.eventsForAsset);
router.get('/events/:application_number', verifyToken, validate(applicationSchema), controller.eventsForAsset);

// The per-asset drill-down under /events/tabs/.../assets/:applicationNumber is
// the same maintenance history as GET /events/:applicationNumber, which the
// client can call directly; it is not duplicated here.

module.exports = router;
