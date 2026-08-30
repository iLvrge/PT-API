'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./external.controller');

const router = express.Router();

const assetSchema = z.object({ params: z.object({ asset: z.string().min(1).max(50) }) });
const identifierSchema = z.object({
  params: z.object({ identifier: z.string().min(1).max(120) }),
});

// Mounted at /. The literal /ptab/document path is declared before
// /ptab/:asset so it cannot be swallowed.
//
// GET /ptab/document/:identifier was unauthenticated in the legacy app, making
// the API an open proxy to the USPTO document store. It requires a token here.
router.get('/ptab/document/:identifier', verifyToken, validate(identifierSchema), controller.ptabDocument);
router.get('/ptab/:asset', verifyToken, validate(assetSchema), controller.ptab);
router.get('/citation/:asset', verifyToken, validate(assetSchema), controller.citations);
router.post('/citation', verifyToken, controller.portfolioCitations);

// GET /generate_thumbnail is deliberately not ported: it ignored its own `file`
// parameter, read a hardcoded PDF from a developer's laptop, wrote a JPEG into
// the process working directory and replied with an unrelated static URL.

module.exports = router;
