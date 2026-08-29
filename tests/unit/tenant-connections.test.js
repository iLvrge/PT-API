'use strict';

// Mock the base connections and the raw query helper so no real DB is touched.
jest.mock('../../src/db', () => ({ connections: { business: { query: jest.fn() } } }));
jest.mock('../../src/db/query');

const mockAuthenticate = jest.fn();
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock('sequelize', () => {
  const actual = jest.requireActual('sequelize');
  class FakeSequelize {
    constructor() {
      this.authenticate = mockAuthenticate;
      this.close = mockClose;
    }
  }
  return { ...actual, Sequelize: FakeSequelize };
});

const q = require('../../src/db/query');
const tenant = require('../../src/db/tenant-connections');

describe('tenant-connections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tenant._reset();
    mockAuthenticate.mockResolvedValue(undefined);
  });

  it('returns null for a non-positive orgId without hitting the DB', async () => {
    await expect(tenant.getConnection(0)).resolves.toBeNull();
    expect(q.selectOne).not.toHaveBeenCalled();
  });

  it('returns null when the organisation has no database configured', async () => {
    q.selectOne.mockResolvedValue({ organisation_id: 5, org_host: null, org_db: null });
    await expect(tenant.getConnection(5)).resolves.toBeNull();
  });

  it('opens, authenticates and caches a connection', async () => {
    q.selectOne.mockResolvedValue({
      organisation_id: 118,
      org_host: 'db.example',
      org_db: 'db_118',
      org_usr: 'u',
      org_pass: 'p',
    });

    const first = await tenant.getConnection(118);
    expect(first).not.toBeNull();
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);

    // Second call is served from cache — no second credential lookup.
    const second = await tenant.getConnection(118);
    expect(second).toBe(first);
    expect(q.selectOne).toHaveBeenCalledTimes(1);
  });

  it('returns null and closes the socket when authentication fails', async () => {
    q.selectOne.mockResolvedValue({
      organisation_id: 7,
      org_host: 'db.example',
      org_db: 'db_7',
      org_usr: 'u',
      org_pass: 'p',
    });
    mockAuthenticate.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(tenant.getConnection(7)).resolves.toBeNull();
    expect(mockClose).toHaveBeenCalled();
  });

  it('evicts idle connections past the TTL', async () => {
    q.selectOne.mockResolvedValue({
      organisation_id: 9,
      org_host: 'db.example',
      org_db: 'db_9',
      org_usr: 'u',
      org_pass: 'p',
    });
    await tenant.getConnection(9);
    await tenant.evictIdle(-1); // everything is "older" than -1ms
    expect(mockClose).toHaveBeenCalled();
    // A subsequent get re-opens (credentials fetched again).
    await tenant.getConnection(9);
    expect(q.selectOne).toHaveBeenCalledTimes(2);
  });
});
