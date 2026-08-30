'use strict';

const express = require('express');
const { verifyToken, requireAdmin } = require('../../middleware/auth');
const controller = require('./admin-tree.controller');

const router = express.Router();

// Mounted at /admin.
router.post('/corporate_tree', [verifyToken, requireAdmin], controller.uploadCorporateTree);

module.exports = router;
