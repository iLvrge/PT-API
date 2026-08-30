'use strict';

jest.mock('../../src/modules/auth/auth.repository');
jest.mock('../../src/modules/users/users.repository');

const request = require('supertest');
const bcrypt = require('bcrypt');
const authRepository = require('../../src/modules/auth/auth.repository');
const { startTestServer } = require('../helpers/server');

const app = startTestServer();

describe('auth routes (full HTTP stack, DB mocked)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /signin', () => {
    it('400 when the body is missing fields', async () => {
      const res = await request(app).post('/signin').send({ username: 'u' }).expect(400);
      expect(res.body.error.message).toBe('Validation failed');
    });

    it('200 and a token for valid credentials', async () => {
      const hash = await bcrypt.hash('secret', 4);
      authRepository.findByUsername.mockResolvedValue({
        user_id: 335,
        organisation_id: 118,
        password: hash,
      });
      const res = await request(app)
        .post('/signin')
        .send({ username: 'v@x.com', password: 'secret' })
        .expect(200);
      expect(res.body.auth).toBe(true);
      expect(typeof res.body.accessToken).toBe('string');
    });

    it('401 for a wrong password', async () => {
      const hash = await bcrypt.hash('secret', 4);
      authRepository.findByUsername.mockResolvedValue({ user_id: 1, organisation_id: 1, password: hash });
      await request(app).post('/signin').send({ username: 'v@x.com', password: 'nope' }).expect(401);
    });
  });

  describe('GET /refresh-token', () => {
    it('401 without a token', async () => {
      await request(app).get('/refresh-token').expect(401);
    });
  });

  describe('unknown route', () => {
    it('404 with a JSON error body', async () => {
      const res = await request(app).get('/does/not/exist').expect(404);
      expect(res.body.error.message).toMatch(/Route not found/);
    });
  });
});
