'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./category-products.service');

const listCategories = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listCategories(req.tenant));
});

const listProducts = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listProducts(req.tenant, req.params.categoryId));
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.tenant, req.body));
});

const removeCategory = asyncHandler(async (req, res) => {
  res.status(200).json(await service.removeCategory(req.tenant, req.params.categoryId));
});

const removeProduct = asyncHandler(async (req, res) => {
  res.status(200).json(await service.removeProduct(req.tenant, req.params.productId));
});

module.exports = { listCategories, listProducts, create, removeCategory, removeProduct };
