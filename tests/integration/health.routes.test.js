'use strict';

jest.mock('../../src/db', () => {
  const model = { create: jest.fn(), destroy: jest.fn() };
  const stubConnection = { define: () => model, query: jest.fn() };
  return {
    ping: jest.fn(),
    connections: {
      business: stubConnection,
      application: stubConnection,
      applicationNew: stubConnection,
      resources: stubConnection,
    },
    closeAll: jest.fn(),
    Sequelize: require('sequelize').Sequelize,
  };
});

const request = require('supertest');
const { ping } = require('../../src/db');
const createApp = require('../../src/app');

const app = createApp();

describe('health routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /health is always 200', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready is 200 when every DB is up', async () => {
    ping.mockResolvedValue({ business: 'up', application: 'up' });
    const res = await request(app).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ready');
  });

  it('GET /health/ready is 503 when a DB is down', async () => {
    ping.mockResolvedValue({ business: 'up', application: 'down' });
    const res = await request(app).get('/health/ready').expect(503);
    expect(res.body.status).toBe('degraded');
  });
});
