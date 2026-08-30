'use strict';

const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./share.controller');

const router = express.Router();

// Public share endpoints are reachable without a token, so they get their own,
// tighter limiter — a share code is short and would otherwise be brute-forceable.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const code = z.string().min(1).max(64);
const asset = z.string().min(1).max(50);

const codeSchema = z.object({ params: z.object({ code }) });
const codeTypeSchema = z.object({ params: z.object({ code, type: z.coerce.number().int() }) });
const assetCodeSchema = z.object({ params: z.object({ code, asset }) });

// Mounted at /. Literal segments are declared before /share/:code/:type so it
// cannot swallow /share/data/... or /share/timeline/... .
router.post('/share', verifyToken, controller.create);
router.get('/share/illustration/:asset/:code', publicLimiter, validate(assetCodeSchema), controller.shareOneAsset);
router.get('/share/data/:asset/:code', publicLimiter, validate(assetCodeSchema), controller.assetIllustration);
router.get('/share/timeline/list/:code', publicLimiter, validate(codeSchema), controller.timeline);
router.get('/share/dashboard/list/:code', publicLimiter, validate(codeSchema), controller.dashboard);
router.get('/share/illustrate/show/:code', publicLimiter, validate(codeSchema), controller.firstIllustration);
router.get('/share/:code/:type', publicLimiter, validate(codeTypeSchema), controller.assets);

module.exports = router;
