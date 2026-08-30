'use strict';

const express = require('express');
const validate = require('../../middleware/validate');
const { authLimiter } = require('../../middleware/security');
const controller = require('./auth.controller');
const schema = require('./auth.validation');

const router = express.Router();

// Mounted at /admin -> POST /admin/signin
router.post('/signin', authLimiter, validate(schema.signinSchema), controller.adminSignin);

module.exports = router;
