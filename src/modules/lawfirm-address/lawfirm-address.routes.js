'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./lawfirm-address.controller');
const schema = require('./lawfirm-address.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

router.get('/lawfirm_address', guard, controller.listAll);
router.get('/lawfirm_address/:lawfirmId', guard, validate(schema.lawfirmIdSchema), controller.listByLawfirm);
router.post('/lawfirm_address', guard, validate(schema.createSchema), controller.create);
router.put('/lawfirm_address/:addressId', guard, validate(schema.updateSchema), controller.update);
router.delete('/lawfirm_address/:addressId', guard, validate(schema.addressIdSchema), controller.remove);

module.exports = router;
