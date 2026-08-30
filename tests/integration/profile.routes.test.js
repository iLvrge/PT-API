'use strict';

jest.mock('../../src/modules/profile/profile.repository');
jest.mock('../../src/modules/users/users.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const profileRepo = require('../../src/modules/profile/profile.repository');
const usersRepo = require('../../src/modules/users/users.repository');
const createApp = require('../../src/app');
const { env } = require('../../src/config/env');

const app = createApp();
const token = jwt.sign({ id: 335, orgId: 118 }, env.auth.secret);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 335, organisation_id: 118, type: 0 });
});

describe('GET /profile', () => {
  it('401 without a token', async () => {
    await request(app).get('/profile').expect(401);
  });

  it('200 with the shaped profile', async () => {
    profileRepo.findProfile.mockResolvedValue({
      id: 335,
      first_name: 'Vivek',
      last_name: 'Test',
      email_address: 'v@x.com',
      role_name: 'Manager',
      organisation_id: 118,
      organisation_name: 'Vivek3',
      organisation_type: 2,
    });
    const res = await request(app).get('/profile').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.user.id).toBe(335);
    expect(res.body.user.organisation.organisation_type).toBe('Bank');
  });
});
