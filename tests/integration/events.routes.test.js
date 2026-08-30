'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/events/events.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/events/events.repository');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const bankToken = jwt.sign({ id: 5, orgId: 118, org_type: 2 }, env.auth.secret);
const auth = (req, t = token) => req.set('Authorization', `Bearer ${t}`);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue({ id: 't' });
  repo.lifeSpan.mockResolvedValue([[]]);
});

describe('auth', () => {
  it('401s without a token', async () => {
    await request(app).get('/events/tabs').expect(401);
  });
});

describe('GET /events/tabs', () => {
  it('builds the life-span series from the stored procedure', async () => {
    repo.lifeSpan.mockResolvedValue([[
      { application: '111', appno_date: '2000-01-01' },
    ]]);

    const res = await auth(
      request(app).get('/events/tabs?type=acquired&companies=%5B9%5D&tabs=%5B1%5D')
    ).expect(200);

    expect(repo.lifeSpan).toHaveBeenCalledWith(
      expect.objectContaining({ layoutId: 32, companies: [9] })
    );
    expect(res.body[0]).toEqual({ year: 2000, count: 1 });
    expect(res.body).toHaveLength(21);
  });

  it('expands the shorthand tab before calling the procedure', async () => {
    await auth(request(app).get('/events/tabs?type=acquired&tabs=%5B17%5D')).expect(200);
    expect(repo.lifeSpan).toHaveBeenCalledWith(expect.objectContaining({ tabs: [17, 1, 6] }));
  });

  it('400s on a malformed companies list', async () => {
    await auth(request(app).get('/events/tabs?companies=oops')).expect(400);
  });
});

describe('GET /events/tabs/:tabID...', () => {
  it('scopes to the tab', async () => {
    await auth(request(app).get('/events/tabs/3')).expect(200);
    expect(repo.lifeSpan).toHaveBeenCalledWith(expect.objectContaining({ tabs: [3] }));
  });

  it('scopes down to one transaction', async () => {
    await auth(request(app).get('/events/tabs/3/companies/9/customers/7/transactions/500')).expect(200);
    expect(repo.lifeSpan).toHaveBeenCalledWith(
      expect.objectContaining({ companies: [9], customers: [7], assignments: [500] })
    );
  });

  it('503s when the tenant database is unavailable', async () => {
    tenantConns.getConnection.mockResolvedValue(null);
    await auth(request(app).get('/events/tabs/3')).expect(503);
  });

  it('does not let /events/tabs/:tabID swallow the bare /events/tabs', async () => {
    await auth(request(app).get('/events/tabs')).expect(200);
    expect(repo.lifeSpan).toHaveBeenCalledWith(expect.objectContaining({ tabs: [] }));
  });
});

describe('POST /events/abandoned/maintainence/assets', () => {
  it('buckets the portfolio by maintenance window', async () => {
    repo.metricApplications.mockResolvedValue([
      { application: 'a', patent: '1' },
      { application: 'b', patent: '' },
    ]);
    repo.maintenanceEvents.mockResolvedValue([{ appno_doc_num: 'a', event_code: 'M1551' }]);

    const res = await auth(request(app).post('/events/abandoned/maintainence/assets'))
      .send({ selectedCompanies: '[9]', type: 'acquired' })
      .expect(200);

    expect(res.body[0]).toEqual(['Element', 'Assets', { type: 'string', role: 'style' }]);
    expect(res.body.find((r) => r[0] === 'Application')[1]).toBe(1);
  });

  it('passes bank mode through from the token', async () => {
    repo.metricApplications.mockResolvedValue([]);
    await auth(request(app).post('/events/abandoned/maintainence/assets'), bankToken)
      .send({ selectedCompanies: '[9]', type: 'acquired' })
      .expect(200);
    expect(repo.metricApplications).toHaveBeenCalledWith(expect.objectContaining({ bankMode: true }));
  });
});

describe('POST /events/abandoned/yearly/assets', () => {
  it('returns a gap-free yearly series', async () => {
    repo.metricApplications.mockResolvedValue([{ application: '111' }]);
    repo.abandonedByYear.mockResolvedValue([
      { year: '2010', count: 1 }, { year: '2012', count: 2 },
    ]);

    const res = await auth(request(app).post('/events/abandoned/yearly/assets'))
      .send({ selectedCompanies: '[9]', type: 'acquired' })
      .expect(200);

    expect(res.body).toHaveLength(4); // header + 2010, 2011, 2012
    expect(res.body[2].slice(0, 2)).toEqual([2011, 0]);
  });
});

describe('GET /events/:applicationNumber', () => {
  it('returns the maintenance history with its icons', async () => {
    repo.eventsForApplication.mockResolvedValue([
      { event_code: 'M1551', eventdate: '2018-01-01', icon1: 1 },
    ]);
    const res = await auth(request(app).get('/events/13456789')).expect(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.icons['M1551'].icon1).toMatch(/^<svg/);
    expect(res.body.expired).toBe(false);
  });

  it('returns just the count when asked', async () => {
    repo.eventsForApplication.mockResolvedValue([{ event_code: 'M1551' }, { event_code: 'M2552' }]);
    const res = await auth(request(app).get('/events/13456789?counter=1')).expect(200);
    expect(res.text).toBe('2');
  });

  it('400s on a number with punctuation', async () => {
    await auth(request(app).get('/events/13,456.789')).expect(400);
  });

  it('does not swallow the literal /events paths', async () => {
    repo.transactionAssets.mockResolvedValue([]);
    await auth(request(app).get('/events/assets/transactions/500')).expect(200);
    expect(repo.eventsForApplication).not.toHaveBeenCalled();
  });
});

describe('GET /events/assets/status/:applicationNumber', () => {
  it('assembles the prosecution timeline', async () => {
    repo.publicationDates.mockResolvedValue({ filling_date: '2013-01-01', pgpub_date: '2014-06-01' });
    repo.grantDates.mockResolvedValue({ grant_doc_num: '9446259', grant_date: '2016-09-20' });
    repo.statusHistory.mockResolvedValue([{ status: 'Docketed', status_date: '2013-03-01' }]);

    const res = await auth(request(app).get('/events/assets/status/13456789')).expect(200);
    expect(res.body).toMatchObject({ grant_doc_num: '9446259', pgpub_date: '2014-06-01' });
    expect(res.body.status).toHaveLength(1);
  });
});

describe('GET /events/all/assets/:category_type', () => {
  it('returns the unrecorded assets with their icon', async () => {
    repo.assetsToRecord.mockResolvedValue([{ application: '111' }]);
    const res = await auth(request(app).get('/events/all/assets/to_record?companies=%5B9%5D'))
      .expect(200);
    expect(res.body.list).toHaveLength(1);
    expect(res.body.icons['13'].icon1).toMatch(/^<svg/);
  });

  it('400s on a category that is not implemented', async () => {
    await auth(request(app).get('/events/all/assets/nonsense?companies=%5B9%5D')).expect(400);
  });

  it('is not shadowed by the detail path', async () => {
    repo.assetToRecordDetail.mockResolvedValue({ application: '111' });
    await auth(request(app).get('/events/all/assets/to_record/detail/111')).expect(200);
    expect(repo.assetsToRecord).not.toHaveBeenCalled();
  });

  it('404s for an unrecorded asset that does not exist', async () => {
    repo.assetToRecordDetail.mockResolvedValue(null);
    await auth(request(app).get('/events/all/assets/to_record/detail/999')).expect(404);
  });
});
