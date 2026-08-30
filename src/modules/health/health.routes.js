'use strict';

/**
 * Liveness and readiness endpoints (audit: there was no health check, so
 * supervisor and any load balancer were probing blind).
 *
 *   GET /health        — process is up (always 200)
 *   GET /health/ready  — every configured DB connection authenticates
 *
 * Follows the same layering as every other module: routes -> controller ->
 * service -> db.
 */

const express = require('express');
const controller = require('./health.controller');

const router = express.Router();

router.get('/health', controller.liveness);
router.get('/health/ready', controller.readiness);

module.exports = router;
