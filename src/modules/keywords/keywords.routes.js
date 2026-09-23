'use strict';

const express = require('express');
const { verifyToken, requireAdmin } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./keywords.controller');
const schema = require('./keywords.validation');

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get('/keywords', controller.list);
router.post('/keywords', validate(schema.createKeywordSchema), controller.create);
router.put('/keywords/:keyword_id', validate(schema.updateKeywordSchema), controller.update);
router.delete('/keywords/:keyword_id', validate(schema.keywordIdSchema), controller.remove);

module.exports = router;
