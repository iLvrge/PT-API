'use strict';

/**
 * Background job endpoints, all admin-only.
 *
 *   GET  /admin/jobs            recent jobs and queue depth
 *   GET  /admin/jobs/catalogue  what can be run, and what currently cannot
 *   GET  /admin/jobs/:id        one job's state, progress and failure reason
 *   POST /admin/jobs            start a job by catalogue name
 *
 * Admin-only because starting one rebuilds a customer's data, and because the
 * list shows which customers are being worked on.
 */

const express = require('express');
const controller = require('./jobs.controller');
const { verifyToken, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.use('/jobs', verifyToken, requireAdmin);

// Before /jobs/:id, or "catalogue" is read as a job id.
router.get('/jobs/catalogue', controller.catalogue);
router.get('/jobs', controller.list);
router.get('/jobs/:id', controller.show);
router.post('/jobs', controller.create);

module.exports = router;
