'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/activities/activities.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const tenantConns = require('../../src/db/tenant-connections');
const repo = require('../../src/modules/activities/activities.repository');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const tenant = { id: 't' };
const auth = () => ['Authorization', `Bearer ${token}`];

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  tenantConns.getConnection.mockResolvedValue(tenant);
});

describe('activities routes', () => {
  it('GET /activities?count=true returns a count', async () => {
    repo.countByComplete.mockResolvedValue(4);
    const res = await request(app).get('/activities?count=true&type=fix').set(...auth()).expect(200);
    expect(res.body).toEqual([{ count_items: 4 }]);
    expect(repo.countByComplete).toHaveBeenCalledWith(tenant, 0, [1, 2]);
  });

  it('GET /activities lists and nests professional/firm/user/document', async () => {
    repo.listByComplete.mockResolvedValue([
      { id: 1, type: 3, p_first_name: 'P', f_firm_name: 'F', u_first_name: 'U', d_title: 'T', d_file: 'f.pdf' },
    ]);
    const res = await request(app).get('/activities').set(...auth()).expect(200);
    expect(res.body[0].professionals.firms.firm_name).toBe('F');
    expect(res.body[0].users.first_name).toBe('U');
    expect(res.body[0].documents.title).toBe('T');
  });

  it('GET /activities/:type/list returns { todo, complete }', async () => {
    repo.listByType.mockResolvedValue([{ id: 1 }]);
    repo.listByComplete.mockResolvedValue([{ id: 2 }]);
    const res = await request(app).get('/activities/3/list').set(...auth()).expect(200);
    expect(res.body).toHaveProperty('todo');
    expect(res.body).toHaveProperty('complete');
  });

  it('GET /activities/comments/:st/:subject returns bare comments', async () => {
    repo.commentsForSubject.mockResolvedValue([{ comment: 'hi', created_at: '2026-01-01 00:00:00' }]);
    await request(app).get('/activities/comments/2/abc').set(...auth()).expect(200);
    expect(repo.commentsForSubject).toHaveBeenCalledWith(tenant, '2', 'abc');
  });

  it('GET /activities/:id 404 when missing', async () => {
    repo.findByIdWithDocument.mockResolvedValue(null);
    await request(app).get('/activities/99').set(...auth()).expect(404);
  });

  it('POST /activities/:type is 501 (deferred)', async () => {
    await request(app).post('/activities/fix').set(...auth()).send({ comment: 'x' }).expect(501);
  });

  it('PUT /activities/:id marks complete', async () => {
    repo.findById.mockResolvedValue({ activity_id: 7 });
    repo.setComplete.mockResolvedValue([1]);
    const res = await request(app).put('/activities/7').set(...auth()).send({ complete: 1 }).expect(200);
    expect(res.body).toEqual({ activity_id: 7, complete: 1 });
  });
});
