'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const controller = require('./profile.controller');

const router = express.Router();

// Any authenticated user (not admin-only).
router.get('/profile', verifyToken, controller.getProfile);

module.exports = router;
