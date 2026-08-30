'use strict';

jest.mock('../../src/modules/auth/auth.repository');
jest.mock('../../src/modules/users/users.repository');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authRepository = require('../../src/modules/auth/auth.repository');
const usersRepository = require('../../src/modules/users/users.repository');
const service = require('../../src/modules/auth/auth.service');
const { env } = require('../../src/config/env');

describe('auth.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('signin', () => {
    it('issues a verifiable JWT for correct credentials', async () => {
      const hash = await bcrypt.hash('secret', 4);
      authRepository.findByUsername.mockResolvedValue({
        user_id: 335,
        organisation_id: 118,
        password: hash,
        organisation_type: 1,
        subscribtion: 2,
      });

      const result = await service.signin({ username: 'u@x.com', password: 'secret' });

      expect(result.auth).toBe(true);
      const decoded = jwt.verify(result.accessToken, env.auth.secret);
      expect(decoded.id).toBe(335);
      expect(decoded.orgId).toBe(118);
    });

    it('rejects a wrong password with 401', async () => {
      const hash = await bcrypt.hash('secret', 4);
      authRepository.findByUsername.mockResolvedValue({ user_id: 1, organisation_id: 1, password: hash });
      await expect(service.signin({ username: 'u', password: 'wrong' })).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('rejects an unknown user with 401 and the same message', async () => {
      authRepository.findByUsername.mockResolvedValue(null);
      await expect(service.signin({ username: 'ghost', password: 'x' })).rejects.toMatchObject({
        statusCode: 401,
        message: 'Incorrect username or password',
      });
    });
  });

  describe('refresh (F1 — signature must be verified)', () => {
    it('rejects a forged token whose signature does not match', async () => {
      // A token signed with a DIFFERENT secret — the old code would have accepted
      // this because it only base64-decoded the payload.
      const forged = jwt.sign({ id: 1, orgId: 1 }, 'attacker-secret');
      await expect(service.refresh(forged)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('rejects a token with a valid signature but an inactive user', async () => {
      const good = jwt.sign({ id: 1, orgId: 1 }, env.auth.secret);
      usersRepository.findActiveById.mockResolvedValue(null);
      await expect(service.refresh(good)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('re-issues a token for a valid signature and active user', async () => {
      const good = jwt.sign({ id: 335, orgId: 118 }, env.auth.secret);
      usersRepository.findActiveById.mockResolvedValue({ user_id: 335, organisation_id: 118 });
      const result = await service.refresh(good);
      const decoded = jwt.verify(result.accessToken, env.auth.secret);
      expect(decoded.id).toBe(335);
    });

    it('rejects a missing token', async () => {
      await expect(service.refresh(undefined)).rejects.toMatchObject({ statusCode: 401 });
    });
  });
});

describe('auth.service.adminSignin', () => {
  const bcryptLib = require('bcrypt');
  it('issues a token for a valid admin', async () => {
    const hash = await bcryptLib.hash('pw', 4);
    authRepository.findAdminByUsername.mockResolvedValue({ user_id: 9, organisation_id: 1, password: hash, type: 9 });
    const res = await service.adminSignin({ username: 'admin', password: 'pw' });
    expect(res.auth).toBe(true);
  });
  it('rejects a non-admin/unknown user with 401', async () => {
    authRepository.findAdminByUsername.mockResolvedValue(null);
    await expect(service.adminSignin({ username: 'x', password: 'y' })).rejects.toMatchObject({ statusCode: 401 });
  });
});
