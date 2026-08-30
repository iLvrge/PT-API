'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/entities/entities.repository');
jest.mock('../../src/modules/validity/validity.repository');
// Partial mocks: SUMMED / COUNTERS are the column lists the services build
// their zero-filled shapes from, so they must survive the mock.
jest.mock('../../src/modules/transactions/transactions.repository', () => {
  const actual = jest.requireActual('../../src/modules/transactions/transactions.repository');
  return {
    ...actual,
    counters: jest.fn(),
    assignees: jest.fn(),
    assignors: jest.fn(),
    assignment: jest.fn(),
    assets: jest.fn(),
  };
});
jest.mock('../../src/modules/updates/updates.repository', () => {
  const actual = jest.requireActual('../../src/modules/updates/updates.repository');
  return {
    ...actual,
    organisationName: jest.fn(),
    findParentRepresentative: jest.fn(),
    forRepresentative: jest.fn(),
    forOrganisation: jest.fn(),
  };
});
jest.mock('../../src/modules/search/search.repository');
jest.mock('../../src/modules/tree/tree.repository');
jest.mock('../../src/utils/uploads');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const entitiesRepo = require('../../src/modules/entities/entities.repository');
const validityRepo = require('../../src/modules/validity/validity.repository');
const transactionsRepo = require('../../src/modules/transactions/transactions.repository');
const updatesRepo = require('../../src/modules/updates/updates.repository');
const searchRepo = require('../../src/modules/search/search.repository');
const treeRepo = require('../../src/modules/tree/tree.repository');
const uploads = require('../../src/utils/uploads');
const createApp = require('../../src/app');
const { env } = require('../../src/config/env');

const app = createApp();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  usersRepo.isAdmin.mockResolvedValue(true);
  tenantConns.getConnection.mockResolvedValue({ id: 't' });
});

describe('GET /entity/search/:search_string/:type', () => {
  it('searches counterparties for type 1', async () => {
    entitiesRepo.searchParties.mockResolvedValue([{ id: 1, name: 'Acme' }]);
    const res = await auth(request(app).get('/entity/search/acme/1')).expect(200);
    expect(res.body).toEqual([{ id: 1, name: 'Acme' }]);
    expect(entitiesRepo.searchAssignments).not.toHaveBeenCalled();
  });

  it('searches recorded assignments for type 2', async () => {
    entitiesRepo.searchAssignments.mockResolvedValue([{ id: 7, name: 'Firm' }]);
    await auth(request(app).get('/entity/search/firm/2')).expect(200);
    expect(entitiesRepo.searchAssignments).toHaveBeenCalledWith('firm');
  });

  it('returns an empty list for an unknown type', async () => {
    const res = await auth(request(app).get('/entity/search/acme/9')).expect(200);
    expect(res.body).toEqual([]);
  });

  it('400s on a non-numeric type', async () => {
    await auth(request(app).get('/entity/search/acme/xyz')).expect(400);
  });
});

describe('GET /validity_counter', () => {
  it('returns zeros when the organisation has no rows', async () => {
    validityRepo.counters.mockResolvedValue(null);
    const res = await auth(request(app).get('/validity_counter')).expect(200);
    expect(res.body).toMatchObject({ application: 0, patent: 0, encumbered: 0 });
  });

  it('scopes to the requested companies', async () => {
    validityRepo.counters.mockResolvedValue({ application: 4 });
    await auth(request(app).get('/validity_counter?companies=%5B9%5D')).expect(200);
    expect(validityRepo.counters).toHaveBeenCalledWith(118, [9]);
  });

  it('400s on a malformed companies list', async () => {
    await auth(request(app).get('/validity_counter?companies=oops')).expect(400);
  });
});

describe('GET /transactions', () => {
  it('returns zeros when there are no counters', async () => {
    transactionsRepo.counters.mockResolvedValue(null);
    const res = await auth(request(app).get('/transactions')).expect(200);
    expect(res.body).toMatchObject({ buy: 0, sale: 0, license_out_patent: 0 });
  });

  it('nests the party rows of one transaction', async () => {
    transactionsRepo.assignees.mockResolvedValue([
      { name: 'EE', assignor_and_assignee_id: 1, party_name: 'Acme', id: 5, representative_name: 'Acme Inc' },
    ]);
    transactionsRepo.assignors.mockResolvedValue([]);
    transactionsRepo.assignment.mockResolvedValue({ name: 'Firm', id: 500 });
    transactionsRepo.assets.mockResolvedValue([{ application: '111', patent: '999' }]);

    const res = await auth(request(app).get('/transactions/500')).expect(200);
    expect(res.body.assignees[0]).toEqual({
      name: 'EE',
      assignor_and_assignee_id: 1,
      assignor_and_assignee: { name: 'Acme', id: 5, representative: { name: 'Acme Inc' } },
    });
    expect(res.body.patent).toHaveLength(1);
  });

  it('400s on a non-numeric transaction id', async () => {
    await auth(request(app).get('/transactions/abc')).expect(400);
  });
});

describe('GET /updates/:companyName', () => {
  it('resolves the company through the tenant database', async () => {
    updatesRepo.findParentRepresentative.mockResolvedValue({ representative_id: 9 });
    updatesRepo.forRepresentative.mockResolvedValue({ weekly_transactions: 2 });

    const res = await auth(request(app).get('/updates/Acme%20Inc')).expect(200);
    expect(res.body).toEqual({ weekly_transactions: 2 });
  });

  it('503s when the tenant database is unavailable', async () => {
    tenantConns.getConnection.mockResolvedValue(null);
    await auth(request(app).get('/updates/Acme')).expect(503);
  });
});

describe('GET /search/:search_string', () => {
  it('returns the merged transaction list', async () => {
    searchRepo.byParty.mockResolvedValue([{ rf_id: 1 }]);
    searchRepo.byCorrespondent.mockResolvedValue([]);
    searchRepo.byDocument.mockResolvedValue([{ rf_id: 1 }, { rf_id: 2 }]);

    const res = await auth(request(app).get('/search/acme')).expect(200);
    expect(res.body.total_records).toBe(2);
    expect(res.body.txn_ids).toEqual([1, 2]);
  });
});

describe('GET /tree', () => {
  it('returns every tab even for an empty portfolio', async () => {
    const res = await auth(request(app).get('/tree?portfolio=%5B%5D')).expect(200);
    expect(res.body).toEqual([]);
    expect(treeRepo.tabTotals).not.toHaveBeenCalled();
  });

  it('400s on a malformed portfolio', async () => {
    await auth(request(app).get('/tree?portfolio=oops')).expect(400);
  });

  it('builds the tree for a real portfolio', async () => {
    treeRepo.tabTotals.mockResolvedValue([]);
    treeRepo.parties.mockResolvedValue([]);
    treeRepo.transactions.mockResolvedValue([]);
    treeRepo.assetsForTransactions.mockResolvedValue([]);

    const res = await auth(request(app).get('/tree?portfolio=%5B9%5D')).expect(200);
    expect(res.body).toHaveLength(11);
  });
});

describe('POST /admin/corporate_tree', () => {
  it('400s without a file', async () => {
    await auth(request(app).post('/admin/corporate_tree')).expect(400);
  });

  it('400s on a non-HTML upload', async () => {
    await auth(request(app).post('/admin/corporate_tree'))
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'tree.pdf', contentType: 'application/pdf' })
      .expect(400);
    expect(uploads.uploadFile).not.toHaveBeenCalled();
  });

  it('stores the upload and echoes the markup back', async () => {
    uploads.uploadFile.mockResolvedValue({ Key: 'corporate-tree/tree.html', Location: 'https://x/tree.html' });

    const res = await auth(request(app).post('/admin/corporate_tree'))
      .attach('file', Buffer.from('<table id="TreeView1"></table>'), {
        filename: 'tree.html', contentType: 'text/html',
      })
      .expect(200);

    expect(res.text).toContain('TreeView1');
    expect(uploads.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer), 'corporate-tree', 'tree.html', 'text/html'
    );
  });
});
