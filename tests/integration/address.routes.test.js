'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/address/address.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/address/address.repository');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const tenant = { id: 't' };

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue(tenant);
});

describe('address routes', () => {
  it('GET /address groups addresses under each representative', async () => {
    repo.listByRepresentatives.mockResolvedValue([
      { representative_id: 9, address_id: 1, city: 'NYC' },
      { representative_id: 9, address_id: 2, city: 'LA' },
      { representative_id: 10, address_id: 3, city: 'SF' },
    ]);
    const res = await request(app).get('/address').set('Authorization', `Bearer ${token}`).expect(200);
    const rep9 = res.body.find((r) => r.representative_id === 9);
    expect(rep9.address).toHaveLength(2);
    expect(rep9.address[0]).not.toHaveProperty('representative_id');
  });

  it('keeps a company that has no address, with an empty list', async () => {
    // The LEFT JOIN emits one all-null address row for such a company.
    repo.listByRepresentatives.mockResolvedValue([
      { representative_id: 11, address_id: null, city: null, street_address: null },
    ]);
    const res = await request(app).get('/address').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toEqual([{ representative_id: 11, address: [] }]);
  });

  it('GET /address/companies returns a flat list for the given ids', async () => {
    repo.listFlatByRepresentatives.mockResolvedValue([{ address_id: 1, city: 'NYC' }]);
    await request(app)
      .get('/address/companies?companies=%5B9%5D')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(repo.listFlatByRepresentatives).toHaveBeenCalledWith(tenant, [9]);
  });

  it('POST 400 without street_address', async () => {
    await request(app)
      .post('/address')
      .set('Authorization', `Bearer ${token}`)
      .send({ representative_id: 9 })
      .expect(400);
  });

  it('POST 201 creates', async () => {
    repo.create.mockResolvedValue({ toJSON: () => ({ address_id: 7, representative_id: 9, street_address: '1 Main' }) });
    const res = await request(app)
      .post('/address')
      .set('Authorization', `Bearer ${token}`)
      .send({ representative_id: 9, street_address: '1 Main' })
      .expect(201);
    expect(res.body.address_id).toBe(7);
  });

  it('PUT 404 when the address is missing', async () => {
    repo.findById.mockResolvedValue(null);
    await request(app)
      .put('/address/99')
      .set('Authorization', `Bearer ${token}`)
      .send({ city: 'x' })
      .expect(404);
  });

  it('DELETE 200 when present', async () => {
    repo.findById.mockResolvedValue({ address_id: 7 });
    repo.destroyById.mockResolvedValue(1);
    const res = await request(app).delete('/address/7').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ address_id: 7, deleted: true });
  });
});
