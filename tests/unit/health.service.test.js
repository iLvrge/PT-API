'use strict';

jest.mock('../../src/db', () => ({ ping: jest.fn() }));

const { ping } = require('../../src/db');
const service = require('../../src/modules/health/health.service');

describe('health.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getLiveness reports ok with an uptime', () => {
    const result = service.getLiveness();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
  });

  it('getReadiness is ready when every DB is up', async () => {
    ping.mockResolvedValue({ business: 'up', application: 'up' });
    await expect(service.getReadiness()).resolves.toMatchObject({ ready: true, status: 'ready' });
  });

  it('getReadiness is degraded when any DB is down', async () => {
    ping.mockResolvedValue({ business: 'up', application: 'down' });
    const result = await service.getReadiness();
    expect(result.ready).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.databases.application).toBe('down');
  });
});
