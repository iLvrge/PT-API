'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./selections.controller');
const schema = require('./selections.validation');

const router = express.Router();

router.get('/user_company_selection', verifyToken, controller.getCompanies);
router.post('/user_company_selection', verifyToken, validate(schema.companySchema), controller.setCompanies);

router.get('/user_activity_selection', verifyToken, controller.getActivity);
router.post('/user_activity_selection', verifyToken, validate(schema.activitySchema), controller.setActivity);
router.put('/user_activity_selection', verifyToken, validate(schema.activitySchema), controller.clearActivity);

module.exports = router;
