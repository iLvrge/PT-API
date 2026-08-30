'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/lawfirm-address/lawfirm-address.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/lawfirm-address/lawfirm-address.repository');
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

describe('lawfirm_address routes', () => {
  it('GET lists all', async () => {
    repo.listAll.mockResolvedValue([{ address_id: 1, lawfirm_id: 2, city: 'NYC' }]);
    const res = await request(app).get('/lawfirm_address').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body[0].address_id).toBe(1);
  });

  it('GET /:lawfirmId lists by lawfirm', async () => {
    repo.listByLawfirm.mockResolvedValue([{ address_id: 3, lawfirm_id: 9 }]);
    await request(app).get('/lawfirm_address/9').set('Authorization', `Bearer ${token}`).expect(200);
    expect(repo.listByLawfirm).toHaveBeenCalledWith(tenant, 9);
  });

  it('POST 400 without lawfirm_id', async () => {
    await request(app).post('/lawfirm_address').set('Authorization', `Bearer ${token}`).send({ city: 'x' }).expect(400);
  });

  it('POST 201 creates', async () => {
    repo.create.mockResolvedValue({ toJSON: () => ({ address_id: 5, lawfirm_id: 9, city: 'NYC' }) });
    const res = await request(app)
      .post('/lawfirm_address')
      .set('Authorization', `Bearer ${token}`)
      .send({ lawfirm_id: 9, city: 'NYC' })
      .expect(201);
    expect(res.body.address_id).toBe(5);
  });

  it('DELETE 404 when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await request(app).delete('/lawfirm_address/99').set('Authorization', `Bearer ${token}`).expect(404);
  });
});
