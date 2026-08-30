'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./activities.controller');
const schema = require('./activities.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Order matters: literal / more-specific segments before parameterised ones.
router.get('/activities', guard, validate(schema.listSchema), controller.list);
router.get('/activities/comments/:subject_type/:subject', guard, validate(schema.commentsSchema), controller.comments);
router.get('/activities/:type/:option', guard, validate(schema.typeOptionSchema), controller.byTypeOption);
router.get('/activities/:id', guard, validate(schema.idSchema), controller.getById);
router.post('/activities/:type', guard, controller.create);
router.put('/activities/:id', guard, validate(schema.updateSchema), controller.update);

module.exports = router;
