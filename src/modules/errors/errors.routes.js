'use strict';

/**
 * The data-quality error panel.
 *
 * IMPORTANT: this is a placeholder in the deployed application too. The legacy
 * handler in routes/application/errors.js for this path ignores its parameters
 * entirely and returns hardcoded zeros and empty arrays:
 *
 *     if (type == 'count') res.json({ title: 0, address: 0, other: 0 });
 *     else if (type == 'list') res.json({ invent: [], assign: [], corr: [], address: [], security: [] });
 *
 * So the panel has never shown real numbers. It is ported at the same fidelity
 * so the console gets the shape it expects instead of a 404 — not because the
 * numbers mean anything. The real implementations behind GET /errors and
 * GET /errors/filters were never wired to this route.
 */

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');

const router = express.Router();

const EMPTY_COUNT = { title: 0, address: 0, other: 0 };
const EMPTY_LIST = { invent: [], assign: [], corr: [], address: [], security: [] };

router.get(
  '/errors/:type/:companyName',
  verifyToken,
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    if (type === 'count') return res.status(200).json(EMPTY_COUNT);
    if (type === 'list') return res.status(200).json(EMPTY_LIST);
    // The legacy handler answered nothing at all for any other type, leaving the
    // request open until the client timed out.
    throw ApiError.badRequest("type must be 'count' or 'list'");
  })
);

module.exports = router;
