'use strict';

/**
 * Liveness and readiness endpoints (audit: there was no health check, so
 * supervisor and any load balancer were probing blind).
 *
 *   GET /health   — process is up (always 200)
 *   GET /health/ready — every configured DB connection authenticates
 */

const express = require('express');
const asyncHandler = require('../../utils/async-handler');
const { ping } = require('../../db');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

router.get(
  '/health/ready',
  asyncHandler(async (req, res) => {
    const databases = await ping();
    const allUp = Object.values(databases).every((s) => s === 'up');
    res.status(allUp ? 200 : 503).json({ status: allUp ? 'ready' : 'degraded', databases });
  })
);

module.exports = router;
