'use strict';

// GET /errors/:type/:companyName — the console's data-quality panel.
//
// This endpoint is a placeholder in the deployed application: the legacy handler
// ignores both parameters and returns hardcoded zeros. These tests pin that
// shape so the console keeps working, and pin the one real improvement — an
// unknown `type` now answers 400 instead of hanging the request open forever.

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../src/app');
const { env } = require('../../src/config/env');
const usersRepository = require('../../src/modules/users/users.repository');

const app = createApp();
const token = jwt.sign({ id: 1, orgId: 68 }, env.auth.secret, { expiresIn: 60 });
const auth = (r) => r.set('x-auth-token', token);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepository.findActiveById.mockResolvedValue({ user_id: 1, organisation_id: 68, type: '0' });
});

describe('GET /errors/:type/:companyName', () => {
  it('answers the count shape the panel reads', async () => {
    const res = await auth(request(app).get('/errors/count/Avaya')).expect(200);
    expect(res.body).toEqual({ title: 0, address: 0, other: 0 });
  });

  it('answers the list shape the panel reads', async () => {
    const res = await auth(request(app).get('/errors/list/Avaya')).expect(200);
    expect(res.body).toEqual({ invent: [], assign: [], corr: [], address: [], security: [] });
  });

  it('400s on an unknown type instead of never answering', async () => {
    await auth(request(app).get('/errors/whatever/Avaya')).expect(400);
  });

  it('requires a token', async () => {
    await request(app).get('/errors/count/Avaya').expect(401);
  });

  it('accepts a company name with spaces and punctuation', async () => {
    await auth(request(app).get('/errors/count/AMPACC%20LAW%20GROUP%2C%20PLLC')).expect(200);
  });
});
