'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./category-products.repository');

const listCategories = (tenant) => repository.listCategories(tenant);
const listProducts = (tenant, categoryId) => repository.listProducts(tenant, categoryId);

/**
 * Create (or reuse) a category by name, then bulk-insert its products. Products
 * arrive as a newline-separated string, one product per line (legacy shape).
 */
const create = async (tenant, { category_name, products }) => {
  const existing = await repository.findCategoryByName(tenant, category_name);
  const category = existing || (await repository.createCategory(tenant, category_name));
  const categoryId = category && category.category_id;
  if (!categoryId) throw ApiError.internal('Unable to create category');

  const names = String(products || '')
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean);

  if (names.length) {
    await repository.bulkCreateProducts(
      tenant,
      names.map((name) => ({ name, category_id: categoryId }))
    );
  }

  return { category_id: categoryId, products_added: names.length, message: 'Data added successfully' };
};

const removeCategory = async (tenant, categoryId) => {
  await repository.destroyProductsByCategory(tenant, categoryId);
  await repository.destroyCategory(tenant, categoryId);
  return { category_id: categoryId, deleted: true };
};

const removeProduct = async (tenant, productId) => {
  const deleted = await repository.destroyProduct(tenant, productId);
  if (!deleted) throw ApiError.notFound('Product not found');
  return { product_id: productId, deleted: true };
};

module.exports = { listCategories, listProducts, create, removeCategory, removeProduct };
