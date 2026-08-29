'use strict';

const express = require('express');
const validate = require('../../middleware/validate');
const { authLimiter } = require('../../middleware/security');
const controller = require('./auth.controller');
const schema = require('./auth.validation');

const router = express.Router();

router.post('/signin', authLimiter, validate(schema.signinSchema), controller.signin);
router.get('/refresh-token', authLimiter, controller.refresh);

module.exports = router;
