'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./dashboards.controller');
const schemas = require('./dashboards.validation');

const router = express.Router();
const auth = [verifyToken];
// Routes that read the caller's own company names need their tenant database.
const tenantAuth = [verifyToken, attachTenant];

// Mounted at /dashboards.
router.get('/', auth, validate(schemas.tilesSchema), controller.tiles);
router.get('/parties/inventor/:inventorID', auth, validate(schemas.inventorSchema), controller.inventorParty);

router.post('/collateral', auth, validate(schemas.collateralSchema), controller.collateral);
router.post('/parties/assignor', tenantAuth, validate(schemas.assignorPartiesSchema), controller.assignorParties);
router.post('/parties', tenantAuth, validate(schemas.partiesSchema), controller.parties);
router.post('/filed_assets_events', auth, validate(schemas.companiesOnlySchema), controller.filedAssetEvents);
router.post('/timeline', auth, validate(schemas.timelineSchema), controller.timeline);
router.post('/count', auth, validate(schemas.countSchema), controller.counts);
router.post('/example', auth, validate(schemas.countSchema), controller.example);
router.post('/temp', auth, validate(schemas.tempSchema), controller.temp);
router.post('/share', tenantAuth, validate(schemas.shareSchema), controller.share);
router.post('/', auth, validate(schemas.metricSchema), controller.metric);

// GET /check is deliberately not ported: it was an unauthenticated debug route
// that fired a PTAB request for three hardcoded patent numbers and never sent a
// response, so every call leaked a hanging socket.

module.exports = router;
