'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/modules/auth/auth.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const usersRepository = require('../../src/modules/users/users.repository');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();

// A valid admin token: verifyToken -> findActiveById, requireAdmin -> isAdmin.
const adminToken = jwt.sign({ id: 9, orgId: 118 }, env.auth.secret);

const asActiveAdmin = () => {
  usersRepository.findActiveById.mockResolvedValue({
    user_id: 9,
    organisation_id: 118,
    type: 9,
  });
  usersRepository.isAdmin.mockResolvedValue(true);
};

describe('users routes (full HTTP stack, DB mocked)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('auth guards', () => {
    it('401 without a token', async () => {
      await request(app).get('/admin/customers/118/users').expect(401);
    });

    it('401 with a forged token (F1)', async () => {
      const forged = jwt.sign({ id: 9, orgId: 118 }, 'attacker');
      await request(app)
        .get('/admin/customers/118/users')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('403 for a valid non-admin token', async () => {
      usersRepository.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
      usersRepository.isAdmin.mockResolvedValue(false);
      await request(app)
        .get('/admin/customers/118/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });

  describe('POST /admin/customers/:id/users', () => {
    beforeEach(asActiveAdmin);

    it('400 with the exact missing field, not a generic message (F13/S1)', async () => {
      const res = await request(app)
        .post('/admin/customers/118/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ first_name: 'Test5', type: 0 }) // no email, no password
        .expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      const fields = res.body.error.details.map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['email_address', 'password']));
    });

    it('201 when last_name is omitted (S1 — blank surname is allowed)', async () => {
      usersRepository.existsByEmail.mockResolvedValue(false);
      usersRepository.create.mockImplementation(async (attrs) => ({
        toJSON: () => ({ user_id: 338, ...attrs }),
      }));

      const res = await request(app)
        .post('/admin/customers/118/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ first_name: 'Test5', email_address: 'er.vivek2512+123@gmail.com', password: '123465', type: 0 })
        .expect(201);

      expect(res.body.id).toBe(338);
      expect(usersRepository.create.mock.calls[0][0].last_name).toBe('');
    });

    it('409 on a duplicate email', async () => {
      usersRepository.existsByEmail.mockResolvedValue(true);
      await request(app)
        .post('/admin/customers/118/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ first_name: 'T', email_address: 'dup@x.com', password: 'secret1', type: 0 })
        .expect(409);
    });
  });

  describe('DELETE /admin/customers/:id/users/:userId', () => {
    beforeEach(asActiveAdmin);

    it('200 when the user exists', async () => {
      usersRepository.findByIdInOrganisation.mockResolvedValue({ user_id: 335 });
      usersRepository.destroyById.mockResolvedValue(1);
      const res = await request(app)
        .delete('/admin/customers/118/users/335')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toEqual({ user_id: 335, deleted: true });
    });

    it('404 when the user is not found (S3 — honest, not a generic 402)', async () => {
      usersRepository.findByIdInOrganisation.mockResolvedValue(null);
      await request(app)
        .delete('/admin/customers/118/users/37')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('GET /admin/customers/:id/users', () => {
    beforeEach(asActiveAdmin);

    it('200 with a list', async () => {
      usersRepository.listByOrganisation.mockResolvedValue([
        { id: 335, first_name: 'Vivek Test', last_name: 'Tester', email_address: 'v@x.com', type: 0 },
      ]);
      const res = await request(app)
        .get('/admin/customers/118/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body[0].id).toBe(335);
    });
  });
});

// keep bcrypt import referenced (used indirectly through the real service hashing)
void bcrypt;
