'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./illustration.controller');

const router = express.Router();

const reelFrameSchema = z.object({
  params: z.object({ reelFrame: z.string().regex(/^\d+-\d+$/, 'expected reel-frame, e.g. 45231-0812') }),
});
const applicationSchema = z.object({
  params: z.object({ applicationNumber: z.string().min(1).max(50) }),
});
const rfIdSchema = z.object({
  params: z.object({ rf_id: z.coerce.number().int().positive() }),
});

// Mounted at /. The literal /connection/asset path is declared before the
// single-segment /connection/:reelFrame so it can never be shadowed.
//
// GET /connection/:reelFrame was unauthenticated in the legacy app (its
// verifyToken was commented out), letting anyone enumerate assignment records.
// It requires a token here.
router.get('/connection/asset/:applicationNumber', [verifyToken, attachTenant], validate(applicationSchema), controller.byApplication);
router.get('/connection/:reelFrame', verifyToken, validate(reelFrameSchema), controller.byReelFrame);
router.get('/collections/:rf_id/illustration', verifyToken, validate(rfIdSchema), controller.byTransaction);

module.exports = router;
