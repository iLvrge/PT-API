'use strict';

// Mock the base db so the factory's define() has a stub connection, and mock
// the raw query helper so reads return fixtures. Writes go through the model
// stub returned by define().
jest.mock('../../src/modules/users/users.repository');

jest.mock('../../src/db', () => {
  const model = { create: jest.fn(), update: jest.fn(), destroy: jest.fn() };
  const stubConnection = { define: () => model, query: jest.fn() };
  return {
    __stubModel: model,
    connections: {
      business: stubConnection,
      application: stubConnection,
      applicationNew: stubConnection,
      resources: stubConnection,
    },
    ping: jest.fn(),
    closeAll: jest.fn(),
    Sequelize: require('sequelize').Sequelize,
  };
});
jest.mock('../../src/db/query');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const q = require('../../src/db/query');
const { __stubModel: stubModel } = require('../../src/db');
const usersRepo = require('../../src/modules/users/users.repository');
const createApp = require('../../src/app');
const { env } = require('../../src/config/env');

const app = createApp();
const token = jwt.sign({ id: 9, orgId: 118 }, env.auth.secret);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 9, organisation_id: 118, type: 9 });
  usersRepo.isAdmin.mockResolvedValue(true);
});

describe('admin simple-list resources (super_keywords / state / company_keywords)', () => {
  it.each(['/admin/super_keywords', '/admin/state', '/admin/company_keywords'])(
    'GET %s returns the list',
    async (path) => {
      q.selectAll.mockResolvedValue([{ id: 1, keyword: 'x' }]);
      const res = await request(app).get(path).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body[0]).toEqual({ id: 1, keyword: 'x' });
    }
  );

  it('POST /admin/super_keywords 400 on empty keyword', async () => {
    await request(app)
      .post('/admin/super_keywords')
      .set('Authorization', `Bearer ${token}`)
      .send({ keyword: '' })
      .expect(400);
  });

  it('POST /admin/state 201 creates', async () => {
    stubModel.create.mockResolvedValue({ state_id: 4, name: 'CA' });
    const res = await request(app)
      .post('/admin/state')
      .set('Authorization', `Bearer ${token}`)
      .send({ keyword: 'CA' })
      .expect(201);
    expect(res.body).toEqual({ id: 4, keyword: 'CA' });
  });

  it('PUT /admin/company_keywords/:id 404 when missing', async () => {
    q.selectOne.mockResolvedValue(null);
    await request(app)
      .put('/admin/company_keywords/99')
      .set('Authorization', `Bearer ${token}`)
      .send({ keyword: 'y' })
      .expect(404);
  });

  it('DELETE /admin/super_keywords/:id 200 when present', async () => {
    q.selectOne.mockResolvedValue({ id: 5, keyword: 'z' });
    stubModel.destroy.mockResolvedValue(1);
    const res = await request(app)
      .delete('/admin/super_keywords/5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ id: 5, deleted: true });
  });

  it('401 without a token', async () => {
    await request(app).get('/admin/state').expect(401);
  });
});
