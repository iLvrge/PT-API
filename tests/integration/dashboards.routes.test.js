'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/dashboards/dashboards.repository');
jest.mock('../../src/shared/share-codes');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/dashboards/dashboards.repository');
const shareCodes = require('../../src/shared/share-codes');
const createApp = require('../../src/app');
const { env } = require('../../src/config/env');

const app = createApp();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const bankToken = jwt.sign({ id: 5, orgId: 118, org_type: 2 }, env.auth.secret);
const tenant = { id: 't' };

const auth = (req, t = token) => req.set('Authorization', `Bearer ${t}`);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue(tenant);
  shareCodes.allocate.mockResolvedValue('abc123');
});

describe('dashboards auth', () => {
  it('401s without a token', async () => {
    await request(app).get('/dashboards').expect(401);
  });
});

describe('GET /dashboards', () => {
  it('returns the tiles for the selected companies', async () => {
    repo.tiles.mockResolvedValue([{ type: 30, number: 4 }]);
    const res = await auth(request(app).get('/dashboards?companies=%5B9%5D')).expect(200);
    expect(repo.tiles).toHaveBeenCalledWith([9]);
    expect(res.body).toEqual([{ type: 30, number: 4 }]);
  });

  it('400s on a malformed companies list', async () => {
    await auth(request(app).get('/dashboards?companies=notjson')).expect(400);
  });
});

describe('POST /dashboards', () => {
  it('passes the parsed selection to the service', async () => {
    repo.metric.mockResolvedValue({ number: 7 });
    const res = await auth(request(app).post('/dashboards'))
      .send({ type: '30', selectedCompanies: '[9]' })
      .expect(200);

    expect(res.body).toEqual({ number: 7 });
    expect(repo.metric).toHaveBeenCalledWith(
      expect.objectContaining({ type: 30, companies: [9], bank: false, bankMode: false })
    );
  });

  it('marks the caller as a bank organisation from the token', async () => {
    repo.metric.mockResolvedValue({});
    await auth(request(app).post('/dashboards'), bankToken)
      .send({ type: '30', selectedCompanies: '[9]' })
      .expect(200);

    expect(repo.metric).toHaveBeenCalledWith(expect.objectContaining({ bankMode: true }));
  });

  it('only reads customers and assignments in bank format', async () => {
    repo.metric.mockResolvedValue({});
    await auth(request(app).post('/dashboards'))
      .send({ type: '1', selectedCompanies: '[9]', customers: '[3]', assignments: '[77]' })
      .expect(200);

    expect(repo.metric).toHaveBeenCalledWith(
      expect.objectContaining({ parties: [], transactions: [] })
    );

    repo.metric.mockClear();
    await auth(request(app).post('/dashboards'))
      .send({
        type: '1', selectedCompanies: '[9]', customers: '[3]', assignments: '[77]',
        format_type: 'Bank',
      })
      .expect(200);

    expect(repo.metric).toHaveBeenCalledWith(
      expect.objectContaining({ parties: [3], transactions: [77], bank: true })
    );
  });

  it('400s on the cumulative series without a company', async () => {
    await auth(request(app).post('/dashboards'))
      .send({ type: '1', selectedCompanies: '[]', data_format: '1' })
      .expect(400);
    expect(repo.metric).not.toHaveBeenCalled();
  });
});

describe('POST /dashboards/temp', () => {
  it('returns an empty object when list is blank', async () => {
    const res = await auth(request(app).post('/dashboards/temp'))
      .send({ type: '1', list: '', selectedCompanies: '[9]' })
      .expect(200);
    expect(res.body).toEqual({});
    expect(repo.tempAggregate).not.toHaveBeenCalled();
  });

  it('recomputes the aggregate when a list is present', async () => {
    repo.ownedAssetsForTemp.mockResolvedValue(['111']);
    repo.tempAggregate.mockResolvedValue({ number: 1, total: 1 });

    const res = await auth(request(app).post('/dashboards/temp'))
      .send({ type: '18', list: '[]', selectedCompanies: '[9]', tabs: '[5]' })
      .expect(200);

    expect(res.body).toEqual({ number: 1, total: 1 });
  });
});

describe('POST /dashboards/timeline', () => {
  it('returns the transactions for the tab', async () => {
    repo.recordedPartyIds.mockResolvedValue([7]);
    repo.timeline.mockResolvedValue([{ id: 1 }]);

    const res = await auth(request(app).post('/dashboards/timeline'))
      .send({ selectedCompanies: '[9]', customers: '[]', type: '1' })
      .expect(200);

    expect(res.body).toEqual([{ id: 1 }]);
  });

  it('400s without a type', async () => {
    await auth(request(app).post('/dashboards/timeline'))
      .send({ selectedCompanies: '[9]' })
      .expect(400);
  });
});

describe('POST /dashboards/count and /example', () => {
  it('returns the precomputed counters', async () => {
    repo.counts.mockResolvedValue([{ type: 30, number: 2 }]);
    const res = await auth(request(app).post('/dashboards/count'))
      .send({ selectedCompanies: '[9]', type: '[30,31]' })
      .expect(200);

    expect(repo.counts).toHaveBeenCalledWith({ companies: [9], types: [30, 31], bankMode: false });
    expect(res.body).toHaveLength(1);
  });

  it('returns an empty object when no example row exists', async () => {
    repo.example.mockResolvedValue(null);
    const res = await auth(request(app).post('/dashboards/example'))
      .send({ selectedCompanies: '[9]', type: '[30]' })
      .expect(200);
    expect(res.body).toEqual({});
  });
});

describe('POST /dashboards/collateral', () => {
  it('forwards the assignor filter', async () => {
    repo.collateral.mockResolvedValue([{ rf_id: 1 }]);
    await auth(request(app).post('/dashboards/collateral'))
      .send({ selectedCompanies: '[9]', assignor_id: '[3]' })
      .expect(200);
    expect(repo.collateral).toHaveBeenCalledWith({ companies: [9], parties: [3] });
  });

  it('returns an empty list with no companies', async () => {
    const res = await auth(request(app).post('/dashboards/collateral'))
      .send({ selectedCompanies: '[]' })
      .expect(200);
    expect(res.body).toEqual([]);
    expect(repo.collateral).not.toHaveBeenCalled();
  });
});

describe('GET /dashboards/parties/inventor/:inventorID', () => {
  it('returns the resolved party', async () => {
    repo.inventorNames.mockResolvedValue({
      assignor_and_assignee_id: 5, given_name: ' Ada', middle_name: '', family_name: ' Lovelace',
    });
    repo.partyIdForNames.mockResolvedValue({ id: 88 });

    const res = await auth(request(app).get('/dashboards/parties/inventor/5')).expect(200);
    expect(res.body).toEqual({ id: 88 });
  });

  it('400s on a non-numeric id', async () => {
    await auth(request(app).get('/dashboards/parties/inventor/abc')).expect(400);
  });
});

describe('POST /dashboards/parties', () => {
  it('needs the tenant connection to name the company', async () => {
    repo.tenantCompanyName.mockResolvedValue('Acme Inc');
    repo.ownedApplications.mockResolvedValue(['111']);
    repo.parties.mockResolvedValue([{ id: 1 }]);

    await auth(request(app).post('/dashboards/parties'))
      .send({ selectedCompanies: '[9]', layout: 'acquired' })
      .expect(200);

    expect(tenantConns.getConnection).toHaveBeenCalledWith(118);
    expect(repo.tenantCompanyName).toHaveBeenCalledWith(tenant, [9]);
  });

  it('503s when the tenant database is unavailable', async () => {
    tenantConns.getConnection.mockResolvedValue(null);
    await auth(request(app).post('/dashboards/parties'))
      .send({ selectedCompanies: '[9]' })
      .expect(503);
  });
});

describe('POST /dashboards/share', () => {
  it('returns the share link as plain text', async () => {
    repo.countUnselectedCompanies.mockResolvedValue(0);
    repo.createShare.mockResolvedValue({ share_id: 1 });

    const res = await auth(request(app).post('/dashboards/share'))
      .send({ selectedCompanies: '[9]', tabs: '[1]', customers: '[]', share_button: '2' })
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^https:\/\/dashboard\./);
  });

  it('400s without a company selection', async () => {
    await auth(request(app).post('/dashboards/share'))
      .send({ selectedCompanies: '[]' })
      .expect(400);
    expect(repo.createShare).not.toHaveBeenCalled();
  });
});

describe('POST /dashboards/filed_assets_events', () => {
  it('returns the maintenance events', async () => {
    repo.filedApplications.mockResolvedValue(['111']);
    repo.maintenanceEvents.mockResolvedValue([{ asset: '111', code: 'M1551' }]);

    const res = await auth(request(app).post('/dashboards/filed_assets_events'))
      .send({ selectedCompanies: '[9]' })
      .expect(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('unknown dashboard paths', () => {
  it('404s rather than 401s', async () => {
    await auth(request(app).get('/dashboards/nope')).expect(404);
  });

  it('does not expose the legacy /check debug route', async () => {
    await auth(request(app).get('/dashboards/check')).expect(404);
  });
});
