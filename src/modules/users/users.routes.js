'use strict';

const express = require('express');
const { verifyToken, requireAdmin } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./users.controller');
const schema = require('./users.validation');

const router = express.Router();

// All user-admin routes require an authenticated admin.
router.use(verifyToken, requireAdmin);

router.get('/customers/:id/users', validate(schema.listUsersSchema), controller.list);
router.post('/customers/:id/users', validate(schema.createUserSchema), controller.create);
router.delete('/customers/:id/users/:userId', validate(schema.deleteUserSchema), controller.remove);

module.exports = router;
