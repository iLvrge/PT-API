'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/professionals/professionals.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/professionals/professionals.repository');
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

describe('professionals routes', () => {
  it('GET nests the lawfirm under each professional', async () => {
    repo.listLawyers.mockResolvedValue([
      { professional_id: 1, first_name: 'A', firm_id: 9, type: 1, lawfirm_id: 9, lawfirm_name: 'Firm X' },
      { professional_id: 2, first_name: 'B', firm_id: null, type: 1, lawfirm_id: null, lawfirm_name: null },
    ]);
    const res = await request(app).get('/professionals').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body[0].lawfirm).toEqual({ id: 9, name: 'Firm X' });
    expect(res.body[1].lawfirm).toBeNull();
  });

  it('POST 400 without a firm_id', async () => {
    await request(app)
      .post('/professionals')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'A' })
      .expect(400);
  });

  it('POST 201 creates a type-1 professional', async () => {
    repo.create.mockResolvedValue({ toJSON: () => ({ professional_id: 7, first_name: 'A', firm_id: 9, type: 1 }) });
    const res = await request(app)
      .post('/professionals')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'A', firm_id: 9 })
      .expect(201);
    expect(res.body.professional_id).toBe(7);
    expect(repo.create.mock.calls[0][1].type).toBe(1);
  });

  it('PUT 404 when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await request(app).put('/professionals/99').set('Authorization', `Bearer ${token}`).send({ first_name: 'Z' }).expect(404);
  });

  it('DELETE 200 when present', async () => {
    repo.findById.mockResolvedValue({ professional_id: 7 });
    repo.destroyById.mockResolvedValue(1);
    const res = await request(app).delete('/professionals/7').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ professional_id: 7, deleted: true });
  });
});
