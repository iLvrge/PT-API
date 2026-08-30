'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/telephone/telephone.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const telRepo = require('../../src/modules/telephone/telephone.repository');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const fakeTenant = { id: 'tenant-118' };

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue(fakeTenant);
});

describe('telephone routes (tenant path E2E)', () => {
  it('401 without a token', async () => {
    await request(app).get('/telephone').expect(401);
  });

  it('503 when the tenant database is unavailable', async () => {
    tenantConns.getConnection.mockResolvedValue(null);
    const res = await request(app).get('/telephone').set('Authorization', `Bearer ${token}`).expect(503);
    expect(res.body.error.message).toMatch(/unavailable/);
  });

  it('GET lists telephones, passing the resolved tenant connection to the repo', async () => {
    telRepo.listByRepresentatives.mockResolvedValue([
      { telephone_id: 1, representative_id: 9, telephone_number: '555' },
    ]);
    const res = await request(app).get('/telephone').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body[0].telephone_number).toBe('555');
    expect(telRepo.listByRepresentatives).toHaveBeenCalledWith(fakeTenant, []);
  });

  it('GET parses ?companies as a representative-id filter', async () => {
    telRepo.listByRepresentatives.mockResolvedValue([]);
    await request(app)
      .get('/telephone?companies=%5B9%2C10%5D') // [9,10]
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(telRepo.listByRepresentatives).toHaveBeenCalledWith(fakeTenant, [9, 10]);
  });

  it('POST 400 on missing representative_id', async () => {
    await request(app)
      .post('/telephone')
      .set('Authorization', `Bearer ${token}`)
      .send({ telephone_number: '555' })
      .expect(400);
  });

  it('POST 201 creates', async () => {
    telRepo.create.mockResolvedValue({ toJSON: () => ({ telephone_id: 7, representative_id: 9, telephone_number: '555' }) });
    const res = await request(app)
      .post('/telephone')
      .set('Authorization', `Bearer ${token}`)
      .send({ representative_id: 9, telephone_number: '555' })
      .expect(201);
    expect(res.body.telephone_id).toBe(7);
  });

  it('DELETE 404 when the telephone is missing', async () => {
    telRepo.findById.mockResolvedValue(null);
    await request(app).delete('/telephone/99').set('Authorization', `Bearer ${token}`).expect(404);
  });

  it('DELETE 200 when present', async () => {
    telRepo.findById.mockResolvedValue({ telephone_id: 7 });
    telRepo.destroyById.mockResolvedValue(1);
    const res = await request(app).delete('/telephone/7').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ telephone_id: 7, deleted: true });
  });
});
