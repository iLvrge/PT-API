'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const validate = require('../../middleware/validate');
const controller = require('./category-products.controller');
const schema = require('./category-products.validation');

const router = express.Router();
const guard = [verifyToken, attachTenant];

// Mounted at /category_products.
router.get('/', guard, controller.listCategories);
router.post('/', guard, validate(schema.createSchema), controller.create);
router.get('/:category_id/products', guard, validate(schema.categoryIdSchema), controller.listProducts);
router.delete('/products/:product_id', guard, validate(schema.productIdSchema), controller.removeProduct);
router.delete('/:category_id', guard, validate(schema.categoryIdSchema), controller.removeCategory);

module.exports = router;
