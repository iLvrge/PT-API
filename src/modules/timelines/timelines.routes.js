'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./timelines.controller');

const router = express.Router();
const guard = [verifyToken, attachTenant];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const groupSchema = z.object({ params: z.object({ groupId: z.coerce.number().int() }) });
const rfIdSchema = z.object({ params: z.object({ rfId: z.coerce.number().int().positive() }) });
const filterSchema = z.object({
  params: z.object({
    groupId: z.coerce.number().int(),
    startDate: isoDate,
    endDate: isoDate,
    scroll: z.string().max(10),
  }),
});
const drillSchema = z.object({
  params: z.object({
    organisation: z.string().min(1).max(300),
    name: z.string().min(1).max(300),
    depth: z.coerce.number().int().min(0).max(3),
    groupId: z.coerce.number().int(),
  }),
});

// Mounted at /timeline. Literal-prefixed paths come before the parameterised
// ones so /:groupId and /:organisation/... cannot shadow them.
router.get('/', guard, controller.list);
router.get('/item/:rfId', verifyToken, validate(rfIdSchema), controller.item);

// The /standalone endpoints ran under the legacy `addToken` middleware, which
// performed NO authentication and hardcoded userId 9 / organisation 11 — so
// any anonymous caller received organisation 11's timeline. They require a real
// token here and are scoped to the caller's own organisation. If the standalone
// timeline is meant to be a public embed, re-open it deliberately and take the
// demo organisation id from configuration rather than from an auth helper.
router.get('/standalone/filter/:groupId/:startDate/:endDate/:scroll', guard, validate(filterSchema), controller.standaloneFiltered);
router.get('/standalone/:groupId', guard, validate(groupSchema), controller.standalone);

router.get('/filter/search/:groupId/:startDate/:endDate/:scroll', guard, validate(filterSchema), controller.searchFiltered);
router.get('/:groupId', guard, validate(groupSchema), controller.byTab);
router.get('/:organisation/:name/:depth/:groupId', guard, validate(drillSchema), controller.drillDown);

module.exports = router;
