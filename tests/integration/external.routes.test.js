'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/external/external.repository');
jest.mock('../../src/modules/external/external.clients');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const repo = require('../../src/modules/external/external.repository');
const clients = require('../../src/modules/external/external.clients');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
});

describe('GET /ptab/{asset}', () => {
  it('401s without a token', async () => {
    await request(app).get('/ptab/16123456').expect(401);
  });

  it('returns the proceedings as events', async () => {
    clients.ptabProceedings.mockResolvedValue({
      results: [{
        proceedingFilingDate: '2020-01-01', proceedingLastModifiedDate: '2020-06-01',
        respondentPartyName: 'Acme', appellantPartyName: 'Beta',
        proceedingStatusCategory: 'Terminated',
      }],
    });
    const res = await auth(request(app).get('/ptab/16123456')).expect(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns just the tally when counter is present', async () => {
    clients.ptabProceedings.mockResolvedValue({ results: [{}, {}] });
    const res = await auth(request(app).get('/ptab/16123456?counter=1')).expect(200);
    expect(res.text).toBe('2');
  });
});

describe('GET /ptab/document/{identifier}', () => {
  it('401s without a token — the legacy route was an open proxy', async () => {
    await request(app).get('/ptab/document/abc123').expect(401);
  });

  it('is not shadowed by /ptab/:asset', async () => {
    clients.ptabDocument.mockResolvedValue(Buffer.from('%PDF-1.4'));
    await auth(request(app).get('/ptab/document/abc123')).expect(200);
    expect(clients.ptabDocument).toHaveBeenCalledWith('abc123');
    expect(clients.ptabProceedings).not.toHaveBeenCalled();
  });
});

describe('GET /citation/{asset}', () => {
  it('returns the citing patents', async () => {
    clients.citationsOf.mockResolvedValue({
      count: 1, us_patent_citations: [{ citation_patent_id: '8480554' }],
    });
    clients.patentDetails.mockResolvedValue({
      count: 1,
      patents: [{
        patent_id: '8480554', patent_title: 'X', patent_date: '2013-01-01',
        application: [{ app_date: '2011-01-01' }],
        assignees: [{ assignee_organization: 'Acme Inc' }],
      }],
    });
    repo.knownAssignees.mockResolvedValue([{ assignee_id: 1, assignee_organization: 'Acme Inc' }]);
    repo.organisationLogos.mockResolvedValue([]);

    const res = await auth(request(app).get('/citation/9446259')).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].assignee).toBe('Acme Inc');
  });

  it('answers 0 rather than failing the tile when PatentsView is down', async () => {
    clients.citationsOf.mockRejectedValue(new Error('429 Too Many Requests'));
    const res = await auth(request(app).get('/citation/9446259?counter=1')).expect(200);
    expect(res.text).toBe('0');
  });

  it('surfaces the failure when a full list was asked for', async () => {
    clients.citationsOf.mockRejectedValue(new Error('429 Too Many Requests'));
    await auth(request(app).get('/citation/9446259')).expect(500);
  });
});

describe('POST /citation', () => {
  it('resolves the selection and returns the citing companies', async () => {
    repo.grantNumbers.mockResolvedValue(['9446259']);
    repo.citingCompanies.mockResolvedValue([{ number: '8480554', assignee: 'Beta Corp' }]);

    const res = await auth(request(app).post('/citation'))
      .send({ list: '[]', total: '5', type: 'acquired', selectedCompanies: '[9]' })
      .expect(200);

    expect(repo.grantNumbers).toHaveBeenCalledWith(
      expect.objectContaining({ layoutId: 32, companies: [9], listIsComplete: false })
    );
    expect(res.body).toHaveLength(1);
  });

  it('uses the caller list directly when it is already complete', async () => {
    repo.grantNumbers.mockResolvedValue([]);
    await auth(request(app).post('/citation'))
      .send({ list: '["16123456"]', total: '1', selectedCompanies: '[9]' })
      .expect(200);

    expect(repo.grantNumbers).toHaveBeenCalledWith(
      expect.objectContaining({ listIsComplete: true, list: ['16123456'] })
    );
  });

  it('returns the tally, uncapped, when counter is 1', async () => {
    repo.grantNumbers.mockResolvedValue(['9446259']);
    repo.citingCompanies.mockResolvedValue([{}, {}, {}]);

    const res = await auth(request(app).post('/citation'))
      .send({ list: '[]', total: '5', selectedCompanies: '[9]', counter: '1' })
      .expect(200);

    expect(res.text).toBe('3');
    expect(repo.citingCompanies).toHaveBeenCalledWith(expect.objectContaining({ limited: false }));
  });

  it('400s on a malformed list', async () => {
    await auth(request(app).post('/citation')).send({ list: 'nope' }).expect(400);
  });

  it('does not query when the selection is empty', async () => {
    const res = await auth(request(app).post('/citation'))
      .send({ list: '[]', total: '0' })
      .expect(200);
    expect(res.body).toEqual([]);
    expect(repo.grantNumbers).not.toHaveBeenCalled();
  });
});

describe('the thumbnail debug route', () => {
  it('is not exposed', async () => {
    await auth(request(app).get('/generate_thumbnail?file=x')).expect(404);
  });
});
