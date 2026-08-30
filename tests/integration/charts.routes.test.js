'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/charts/charts.repository', () => {
  const actual = jest.requireActual('../../src/modules/charts/charts.repository');
  return {
    QUERIES: actual.QUERIES,
    listRepresentativeNames: jest.fn(),
    runChart: jest.fn(),
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/charts/charts.repository');
const createApp = require('../../src/app');
const { env } = require('../../src/config/env');

const app = createApp();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const tenant = { id: 't' };
const auth = () => ['Authorization', `Bearer ${token}`];

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue(tenant);
});

describe('charts routes', () => {
  it('400 for an out-of-range type', async () => {
    await request(app).get('/charts/9').set(...auth()).expect(400);
  });

  it('returns [] when the tenant has no representatives', async () => {
    repo.listRepresentativeNames.mockResolvedValue([]);
    const res = await request(app).get('/charts/1').set(...auth()).expect(200);
    expect(res.body).toEqual([]);
    expect(repo.runChart).not.toHaveBeenCalled();
  });

  it('runs the type-1 query with the resolved names', async () => {
    repo.listRepresentativeNames.mockResolvedValue(['Acme']);
    repo.runChart.mockResolvedValue([{ label: '2026', value: 3 }]);
    const res = await request(app).get('/charts/1').set(...auth()).expect(200);
    expect(res.body[0].value).toBe(3);
    expect(repo.runChart).toHaveBeenCalledWith(1, ['Acme']);
  });
});
