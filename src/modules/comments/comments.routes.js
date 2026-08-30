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
router.get('/comments/:subjectType/:subject', guard, validate(schema.getBySubjectSchema), controller.getBySubject);
router.get('/comments/:subjectType', guard, validate(schema.listSchema), controller.listBySubjectType);
router.post('/comments/:subjectType', guard, validate(schema.createSchema), controller.create);
router.put('/comments/:ID', guard, validate(schema.commentIdSchema), controller.update);
router.delete('/comments/:ID', guard, validate(schema.commentIdSchema), controller.remove);

module.exports = router;
