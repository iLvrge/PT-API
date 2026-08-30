'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/timelines/timelines.repository');
jest.mock('../../src/shared/assignment-data');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/timelines/timelines.repository');
const assignmentData = require('../../src/shared/assignment-data');
const createApp = require('../../src/app');
const { env } = require('../../src/config/env');

const app = createApp();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue({ id: 't' });
});

describe('GET /timeline', () => {
  it('passes the parsed filters through', async () => {
    repo.list.mockResolvedValue([{ id: 1 }]);
    await auth(
      request(app).get('/timeline?from=2020-01-01&to=2020-12-31&companies=%5B9%5D&tabs=%5B3%5D&customers=%5B7%5D')
    ).expect(200);

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 118,
        from: '2020-01-01',
        // The end of the range is moved forward a day so the last day is whole.
        to: '2021-01-01',
        companies: [9],
        tabs: [3],
        parties: [7],
      })
    );
  });

  it('paginates only when a limit is supplied', async () => {
    repo.list.mockResolvedValue([]);
    await auth(request(app).get('/timeline')).expect(200);
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: null }));

    await auth(request(app).get('/timeline?limit=25&offset=50')).expect(200);
    expect(repo.list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25, offset: 50 }));
  });

  it('400s on a malformed companies list', async () => {
    await auth(request(app).get('/timeline?companies=oops')).expect(400);
  });
});

describe('GET /timeline/standalone/:groupId', () => {
  it('401s without a token — the legacy route needed none and served org 11', async () => {
    await request(app).get('/timeline/standalone/1').expect(401);
  });

  it('is scoped to the caller organisation', async () => {
    repo.groupPoints.mockResolvedValue([]);
    await auth(request(app).get('/timeline/standalone/1')).expect(200);
    expect(repo.groupPoints).toHaveBeenCalledWith(expect.objectContaining({ orgId: 118 }));
  });
});

describe('GET /timeline/standalone/filter/...', () => {
  it('reads the scroll direction from the path', async () => {
    repo.countInWindow.mockResolvedValue(5);
    repo.standaloneWindow.mockResolvedValue([]);

    await auth(request(app).get('/timeline/standalone/filter/1/2020-01-01/2020-12-31/right')).expect(200);
    // Scrolling right holds the end fixed 18 months out.
    expect(repo.countInWindow.mock.calls[0][0]).toMatchObject({ endDate: '2021-12-31' });
  });

  it('400s on a malformed date', async () => {
    await auth(request(app).get('/timeline/standalone/filter/1/nope/2020-12-31/right')).expect(400);
  });
});

describe('GET /timeline/filter/search/...', () => {
  it('is not shadowed by /:groupId and encodes scroll as 1/0', async () => {
    repo.countInWindow.mockResolvedValue(5);
    repo.searchWindow.mockResolvedValue([]);

    const res = await auth(
      request(app).get('/timeline/filter/search/0/2020-01-01/2020-12-31/1')
    ).expect(200);

    expect(res.body.type).toBe(9);
    expect(repo.tabPoints).not.toHaveBeenCalled();
  });
});

describe('GET /timeline/:groupId', () => {
  it('returns the points on a tab', async () => {
    repo.tabPoints.mockResolvedValue([{ id: 1 }]);
    const res = await auth(request(app).get('/timeline/3')).expect(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('does not swallow /item/:rfId', async () => {
    assignmentData.byRfId.mockResolvedValue({ assignor: [] });
    await auth(request(app).get('/timeline/item/500')).expect(200);
    expect(repo.tabPoints).not.toHaveBeenCalled();
  });
});

describe('GET /timeline/:organisation/:name/:depth/:groupId', () => {
  it('drills into one company', async () => {
    repo.tenantCompany.mockResolvedValue({ representative_id: 9 });
    repo.drillPoints.mockResolvedValue([{ id: 1 }]);

    const res = await auth(request(app).get('/timeline/Acme/Beta%20Corp/1/1')).expect(200);
    expect(res.body.className).toBe('blue');
    expect(repo.tenantCompany).toHaveBeenCalledWith({ id: 't' }, 'Acme');
  });

  it('404s when the company is unknown', async () => {
    repo.tenantCompany.mockResolvedValue(null);
    await auth(request(app).get('/timeline/Nope/x/0/1')).expect(404);
  });

  it('400s on a depth outside 0-3', async () => {
    await auth(request(app).get('/timeline/Acme/x/9/1')).expect(400);
  });
});
