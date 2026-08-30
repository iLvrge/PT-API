'use strict';

jest.mock('../../src/modules/keywords/keywords.repository');
jest.mock('../../src/modules/users/users.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const keywordsRepo = require('../../src/modules/keywords/keywords.repository');
const usersRepo = require('../../src/modules/users/users.repository');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 9, orgId: 118 }, env.auth.secret);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 9, organisation_id: 118, type: 9 });
  usersRepo.isAdmin.mockResolvedValue(true);
});

describe('keywords routes', () => {
  it('401 without a token', async () => {
    await request(app).get('/admin/keywords').expect(401);
  });

  it('GET returns the list', async () => {
    keywordsRepo.list.mockResolvedValue([{ id: 1, keyword: 'software' }]);
    const res = await request(app).get('/admin/keywords').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body[0].keyword).toBe('software');
  });

  it('POST 400 when keyword is empty (validation, not a generic 402)', async () => {
    const res = await request(app)
      .post('/admin/keywords')
      .set('Authorization', `Bearer ${token}`)
      .send({ keyword: '' })
      .expect(400);
    expect(res.body.error.message).toBe('Validation failed');
  });

  it('POST 201 creates', async () => {
    keywordsRepo.create.mockResolvedValue({ keyword_id: 7, keyword_name: 'ai' });
    const res = await request(app)
      .post('/admin/keywords')
      .set('Authorization', `Bearer ${token}`)
      .send({ keyword: 'ai' })
      .expect(201);
    expect(res.body).toEqual({ id: 7, keyword: 'ai' });
  });

  it('DELETE 404 when missing', async () => {
    keywordsRepo.findById.mockResolvedValue(null);
    await request(app).delete('/admin/keywords/99').set('Authorization', `Bearer ${token}`).expect(404);
  });
});
