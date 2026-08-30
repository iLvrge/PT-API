'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/assets/assets.repository');
jest.mock('../../src/utils/background-job');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/assets/assets.repository');
const backgroundJob = require('../../src/utils/background-job');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue({ id: 't' });
});

describe('GET /assets', () => {
  it('401s without a token', async () => {
    await request(app).get('/assets').expect(401);
  });

  it('lists the organisation assets', async () => {
    repo.listForOrganisation.mockResolvedValue([{ appno_doc_num: '111' }]);
    const res = await auth(request(app).get('/assets')).expect(200);
    expect(repo.listForOrganisation).toHaveBeenCalledWith(118);
    expect(res.body).toHaveLength(1);
  });
});

describe('POST /assets/cpc', () => {
  it('returns the breakdown, its groups and the for-sale set', async () => {
    repo.assetsForSale.mockResolvedValue([{ appno_doc_num: '111' }]);
    repo.cpcBreakdown.mockResolvedValue([{ cpc_code: 'H04L', appNum: '111', section: 'H' }]);
    repo.cpcDefinitions.mockResolvedValue([{ cpc_code: 'H04L', defination: 'Transmission' }]);

    const res = await auth(request(app).post('/assets/cpc'))
      .send({ list: '["111"]', total: '1', type: 'acquired', selectedCompanies: '[9]', range: '3' })
      .expect(200);

    expect(res.body.list).toHaveLength(1);
    expect(res.body.group[0].defination).toBe('Transmission');
    expect(res.body.sales).toEqual(['111']);
  });

  it('400s on a malformed list', async () => {
    await auth(request(app).post('/assets/cpc')).send({ list: 'nope' }).expect(400);
  });

  it('503s when the tenant database is unavailable', async () => {
    tenantConns.getConnection.mockResolvedValue(null);
    await auth(request(app).post('/assets/cpc')).send({ list: '[]' }).expect(503);
  });
});

describe('POST /assets/cpc/:year/:cpcCode', () => {
  it('returns the assets in one cell', async () => {
    repo.assetsInCpcCell.mockResolvedValue([{ asset: '9446259' }]);
    const res = await auth(request(app).post('/assets/cpc/2018/H04L'))
      .send({ list: '["111"]', total: '1', type: 'acquired', range: '3' })
      .expect(200);

    expect(repo.assetsInCpcCell).toHaveBeenCalledWith(
      expect.objectContaining({ year: '2018', cpcCode: 'H04L', list: ['111'] })
    );
    expect(res.body.list).toHaveLength(1);
  });

  it('400s on a year that is not four digits', async () => {
    await auth(request(app).post('/assets/cpc/18/H04L')).send({ list: '[]' }).expect(400);
  });
});

describe('POST /assets/move and DELETE /assets/rollback', () => {
  it('moves assets and returns the transfer ids', async () => {
    repo.findMovedAssets.mockResolvedValue([{ asset_id: 7 }]);
    const res = await auth(request(app).post('/assets/move'))
      .send({ moved_assets: JSON.stringify([
        { grant_doc_num: '9446259', appno_doc_num: '13456789', currentLayout: 15, move_category: 30 },
      ]) })
      .expect(200);
    expect(res.body).toEqual([{ asset_id: 7 }]);
  });

  it('rolls a move back', async () => {
    repo.rollbackAssets.mockResolvedValue(2);
    const res = await auth(request(app).delete('/assets/rollback?revert=%5B7%2C8%5D')).expect(200);
    expect(repo.rollbackAssets).toHaveBeenCalledWith([7, 8]);
    expect(res.body).toEqual({ deleted: true });
  });

  it('reports nothing deleted for an empty list', async () => {
    const res = await auth(request(app).delete('/assets/rollback?revert=%5B%5D')).expect(200);
    expect(res.body).toEqual({ deleted: false });
  });
});

describe('POST /assets/validate', () => {
  it('returns the numbers we do not recognise', async () => {
    repo.knownAssetNumbers.mockResolvedValue(new Set(['9446259']));
    const res = await auth(request(app).post('/assets/validate'))
      .send({ foreign_assets: JSON.stringify(['US9,446,259 B2', 'EP1234567']) })
      .expect(200);
    expect(res.body).toEqual(['EP1234567']);
  });
});

describe('GET /assets/download/:itemID', () => {
  it('resolves the PDF location', async () => {
    repo.reelFrame.mockResolvedValue({ reel_no: '45231', frame_no: '0812', status: 1 });
    const res = await auth(request(app).get('/assets/download/500')).expect(200);
    expect(res.body.link).toContain('assignment-pat-45231-0812.pdf');
  });

  it('is not shadowed by /assets/:asset', async () => {
    repo.reelFrame.mockResolvedValue({ reel_no: '1', frame_no: '2', status: 0 });
    await auth(request(app).get('/assets/download/500')).expect(200);
    expect(repo.findAsset).not.toHaveBeenCalled();
  });

  it('400s on a non-numeric id', async () => {
    await auth(request(app).get('/assets/download/abc')).expect(400);
  });
});

describe('GET /assets/:asset', () => {
  it('proxies the illustration', async () => {
    repo.findAsset.mockResolvedValue([{ rf_id: 500 }]);
    backgroundJob.illustrationJson.mockResolvedValue('{"box":[]}');
    const res = await auth(request(app).get('/assets/9446259')).expect(200);
    expect(res.text).toBe('{"box":[]}');
  });

  it('400s for an unknown number', async () => {
    repo.findAsset.mockResolvedValue([]);
    repo.findAssetInBiblio.mockResolvedValue([]);
    await auth(request(app).get('/assets/nope?flag=1')).expect(400);
  });
});

describe('GET /assets/:patentNumber/:type/outsource', () => {
  it('401s without a token — the legacy route had no auth at all', async () => {
    await request(app).get('/assets/9446259/1/outsource').expect(401);
  });

  it('builds an Assignment Center link for an asset', async () => {
    repo.findAsset.mockResolvedValue([{ rf_id: 500 }]);
    const res = await auth(request(app).get('/assets/9446259/1/outsource')).expect(200);
    expect(res.body.url).toContain('patentNumber%3D9446259');
  });

  it('builds a reel-frame link for a transaction, zero padded', async () => {
    repo.reelFrame.mockResolvedValue({ reel_no: '45231', frame_no: '812' });
    const res = await auth(request(app).get('/assets/500/0/outsource')).expect(200);
    expect(res.body.url).toContain('45231-0812');
  });

  it('answers with an empty body when nothing matched', async () => {
    repo.reelFrame.mockResolvedValue(null);
    const res = await auth(request(app).get('/assets/500/0/outsource')).expect(200);
    expect(res.text).toBe('');
  });

  it('400s on an unknown type', async () => {
    await auth(request(app).get('/assets/500/9/outsource')).expect(400);
  });
});

describe('the pending tiers', () => {
  it('501s for Slack file sharing', async () => {
    await auth(request(app).get('/assets/9446259/files/C123/slack/xoxb')).expect(501);
  });

  it.each([
    ['post', '/assets/external_assets'],
    ['put', '/assets/external_assets'],
    ['patch', '/assets/external_assets'],
    ['delete', '/assets/external_assets'],
    ['post', '/assets/external_assets/sheets'],
    ['post', '/assets/external_assets/sheets/assets'],
    ['post', '/assets/external_assets/sheets/timeline'],
  ])('501s for %s %s', async (method, path) => {
    await auth(request(app)[method](path)).expect(501);
  });
});
