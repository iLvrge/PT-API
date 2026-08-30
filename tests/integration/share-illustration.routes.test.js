'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/share/share.repository');
jest.mock('../../src/modules/illustration/illustration.repository');
jest.mock('../../src/shared/assignment-data');
jest.mock('../../src/shared/share-codes');
jest.mock('../../src/utils/background-job');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const shareRepo = require('../../src/modules/share/share.repository');
const illustrationRepo = require('../../src/modules/illustration/illustration.repository');
const assignmentData = require('../../src/shared/assignment-data');
const shareCodes = require('../../src/shared/share-codes');
const backgroundJob = require('../../src/utils/background-job');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

const sampleAssignment = {
  assignment: {
    reel_no: '45231', frame_no: '0812', convey_ty: 'assignment', convey_text: 'ASSIGNMENT',
    employer_assign: 0, status: 1, record_dt: '2020-03-10', page_count: 1,
    cname: '', caddress_1: '', caddress_2: '',
  },
  assignor: [{ id: 10, normalize_name: 'Acme Inc', or_name: 'A', original_name: 'A', exec_dt: '2020-03-01' }],
  assignee: [{ id: 20, normalize_name: 'Beta Corp', ee_name: 'B', original_name: 'B', rf_id: 500 }],
  properties: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue({ id: 't' });
  shareCodes.allocate.mockResolvedValue('abc123');
});

describe('illustration routes', () => {
  it('401s without a token — the legacy route was public', async () => {
    await request(app).get('/connection/45231-0812').expect(401);
  });

  it('renders the diagram for a reel-frame', async () => {
    illustrationRepo.rfIdForReelFrame.mockResolvedValue(500);
    assignmentData.byRfId.mockResolvedValue(sampleAssignment);

    const res = await auth(request(app).get('/connection/45231-0812')).expect(200);
    expect(illustrationRepo.rfIdForReelFrame).toHaveBeenCalledWith('45231', '0812');
    expect(res.body.box).toHaveLength(2);
    expect(res.body.general.original_number).toBe(500);
  });

  it('400s on a reel-frame that is not two numbers', async () => {
    await auth(request(app).get('/connection/not-a-reel')).expect(400);
  });

  it('returns an empty diagram for an unknown reel-frame', async () => {
    illustrationRepo.rfIdForReelFrame.mockResolvedValue(null);
    const res = await auth(request(app).get('/connection/45231-0812')).expect(200);
    expect(res.body).toEqual({});
  });

  it('resolves an application through the incorrect-names metric', async () => {
    illustrationRepo.rfIdForIncorrectName.mockResolvedValue(500);
    assignmentData.byRfId.mockResolvedValue(sampleAssignment);

    await auth(request(app).get('/connection/asset/111?companies=%5B9%5D')).expect(200);
    expect(illustrationRepo.rfIdForIncorrectName).toHaveBeenCalledWith({
      applicationNumber: '111', companies: [9], bankMode: false,
    });
  });

  it('returns an empty diagram when no company is selected', async () => {
    const res = await auth(request(app).get('/connection/asset/111')).expect(200);
    expect(res.body).toEqual({});
    expect(illustrationRepo.rfIdForIncorrectName).not.toHaveBeenCalled();
  });

  it('renders a diagram straight from a transaction id', async () => {
    assignmentData.byRfId.mockResolvedValue(sampleAssignment);
    const res = await auth(request(app).get('/collections/500/illustration')).expect(200);
    expect(res.body.box).toHaveLength(2);
  });

  it('400s on a non-numeric transaction id', async () => {
    await auth(request(app).get('/collections/abc/illustration')).expect(400);
  });
});

describe('share routes', () => {
  it('requires a token to create a link', async () => {
    await request(app).post('/share').send({ assets: '[]' }).expect(401);
  });

  it('creates a link over an asset list', async () => {
    shareRepo.createShare.mockResolvedValue({ share_id: 7 });
    shareRepo.addAssets.mockResolvedValue([]);

    const res = await auth(request(app).post('/share'))
      .send({ type: '1', assets: JSON.stringify([{ asset: '999', flag: 4 }]) })
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toBe('https://share.patentrack.com/abc123');
  });

  it('400s on malformed assets', async () => {
    await auth(request(app).post('/share')).send({ assets: 'nope' }).expect(400);
  });

  it('serves the asset list for a code without a token', async () => {
    shareRepo.assetRows.mockResolvedValue([{ asset: '999', type: 4, organisation_id: 118 }]);
    shareRepo.resolveAssets.mockResolvedValue([{ asset: '999' }]);
    shareRepo.organisationLogo.mockResolvedValue('logo.png');

    const res = await request(app).get('/share/abc123/1').expect(200);
    expect(res.body).toMatchObject({ total_records: 1, logo: 'logo.png' });
  });

  it('404s an unknown code', async () => {
    shareRepo.assetRows.mockResolvedValue([]);
    await request(app).get('/share/nope/1').expect(404);
  });

  it('does not let /share/:code/:type swallow the literal paths', async () => {
    shareRepo.byCodeWithAssets.mockResolvedValue({
      organisation_id: 118, transactions: '[]', share_lists: [],
    });
    const res = await request(app).get('/share/timeline/list/abc123').expect(200);
    expect(res.body).toEqual({ list: [], groups: [] });
    expect(shareRepo.assetRows).not.toHaveBeenCalled();
  });

  it('serves the dashboard selection', async () => {
    shareRepo.dashboardSelection.mockResolvedValue({
      transactions: '{"selectedCompanies":[9]}', share_button: '2',
    });
    const res = await request(app).get('/share/dashboard/list/abc123').expect(200);
    expect(res.body).toEqual({ selectedCompanies: [9], share_button: '2' });
  });

  it('proxies one asset illustration', async () => {
    shareRepo.coversAsset.mockResolvedValue({ organisation_id: 118, user_id: 5 });
    backgroundJob.illustrationJson.mockResolvedValue('{"box":[]}');
    const res = await request(app).get('/share/data/999/abc123').expect(200);
    expect(res.text).toBe('{"box":[]}');
  });

  it('re-shares a single asset as its own link', async () => {
    shareRepo.byCode.mockResolvedValue({ organisation_id: 118, user_id: 5, type: 1 });
    shareRepo.createShare.mockResolvedValue({ share_id: 8 });
    shareRepo.addAssets.mockResolvedValue([]);

    const res = await request(app).get('/share/illustration/111/abc123').expect(200);
    expect(res.text).toContain('/abc123');
  });
});
