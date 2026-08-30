'use strict';

const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

// reads
const listCategories = (tenant) =>
  q.selectAll(tenant, `SELECT category_id, name FROM categories ORDER BY name DESC`);

const findCategoryByName = (tenant, name) =>
  q.selectOne(tenant, `SELECT category_id FROM categories WHERE name = :name LIMIT 1`, { name });

const listProducts = (tenant, categoryId) =>
  q.selectAll(
    tenant,
    `SELECT product_id, name FROM products WHERE category_id = :categoryId ORDER BY name DESC`,
    { categoryId }
  );

// writes
const createCategory = (tenant, name) => tenantModel(tenant, 'categories').create({ name });

const bulkCreateProducts = (tenant, rows) =>
  tenantModel(tenant, 'products').bulkCreate(rows, { ignoreDuplicates: true });

const destroyProductsByCategory = (tenant, categoryId) =>
  tenantModel(tenant, 'products').destroy({ where: { category_id: categoryId } });

const destroyCategory = (tenant, categoryId) =>
  tenantModel(tenant, 'categories').destroy({ where: { category_id: categoryId } });

const destroyProduct = (tenant, productId) =>
  tenantModel(tenant, 'products').destroy({ where: { product_id: productId } });

module.exports = {
  listCategories,
  findCategoryByName,
  listProducts,
  createCategory,
  bulkCreateProducts,
  destroyProductsByCategory,
  destroyCategory,
  destroyProduct,
};
