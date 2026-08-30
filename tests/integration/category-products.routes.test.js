'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/category-products/category-products.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/category-products/category-products.repository');
const createApp = require('../../src/app');
const { env } = require('../../src/config/env');

const app = createApp();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const tenant = { id: 't' };

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue(tenant);
});

describe('category_products routes', () => {
  it('GET / lists categories', async () => {
    repo.listCategories.mockResolvedValue([{ category_id: 1, name: 'Widgets' }]);
    const res = await request(app).get('/category_products').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body[0].name).toBe('Widgets');
  });

  it('POST 400 without category_name', async () => {
    await request(app).post('/category_products').set('Authorization', `Bearer ${token}`).send({ products: 'a' }).expect(400);
  });

  it('POST 201 reuses an existing category and splits products by newline', async () => {
    repo.findCategoryByName.mockResolvedValue({ category_id: 3 });
    repo.bulkCreateProducts.mockResolvedValue([]);
    const res = await request(app)
      .post('/category_products')
      .set('Authorization', `Bearer ${token}`)
      .send({ category_name: 'Widgets', products: 'A\nB\n\n C ' })
      .expect(201);
    expect(res.body.category_id).toBe(3);
    expect(res.body.products_added).toBe(3);
    const rows = repo.bulkCreateProducts.mock.calls[0][1];
    expect(rows).toEqual([
      { name: 'A', category_id: 3 },
      { name: 'B', category_id: 3 },
      { name: 'C', category_id: 3 },
    ]);
  });

  it('POST 201 creates a new category when none exists', async () => {
    repo.findCategoryByName.mockResolvedValue(null);
    repo.createCategory.mockResolvedValue({ category_id: 9 });
    repo.bulkCreateProducts.mockResolvedValue([]);
    const res = await request(app)
      .post('/category_products')
      .set('Authorization', `Bearer ${token}`)
      .send({ category_name: 'New', products: 'X' })
      .expect(201);
    expect(res.body.category_id).toBe(9);
  });

  it('GET /:categoryId/products lists products', async () => {
    repo.listProducts.mockResolvedValue([{ product_id: 1, name: 'A' }]);
    await request(app).get('/category_products/3/products').set('Authorization', `Bearer ${token}`).expect(200);
    expect(repo.listProducts).toHaveBeenCalledWith(tenant, 3);
  });

  it('DELETE /:categoryId removes products then the category', async () => {
    repo.destroyProductsByCategory.mockResolvedValue(2);
    repo.destroyCategory.mockResolvedValue(1);
    const res = await request(app).delete('/category_products/3').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ category_id: 3, deleted: true });
  });

  it('DELETE /products/:productId 404 when missing', async () => {
    repo.destroyProduct.mockResolvedValue(0);
    await request(app).delete('/category_products/products/99').set('Authorization', `Bearer ${token}`).expect(404);
  });
});
