'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./lawfirm.controller');
const schema = require('./lawfirm.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

router.get('/lawfirm', guard, validate(schema.listLawfirmSchema), controller.list);
router.post('/lawfirm', guard, validate(schema.createLawfirmSchema), controller.create);
router.put('/lawfirm/:lawfirmId', guard, validate(schema.updateLawfirmSchema), controller.update);
router.delete('/lawfirm/:lawfirmId', guard, validate(schema.lawfirmIdSchema), controller.remove);

module.exports = router;
