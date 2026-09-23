'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./comments.controller');
const schema = require('./comments.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// More specific route first.
router.get('/comments/:subject_type/:subject', guard, validate(schema.getBySubjectSchema), controller.getBySubject);
router.get('/comments/:subject_type', guard, validate(schema.listSchema), controller.listBySubjectType);
router.post('/comments/:subject_type', guard, validate(schema.createSchema), controller.create);
router.put('/comments/:id', guard, validate(schema.commentIdSchema), controller.update);
router.delete('/comments/:id', guard, validate(schema.commentIdSchema), controller.remove);

module.exports = router;
