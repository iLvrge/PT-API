'use strict';

/*
 * The auth middleware's lookup cache. Every authenticated request used to run
 * the token-holder lookup and the admin check against the database; both are
 * cached for a minute per user. The cache is off under test by default, so it
 * is switched on here and off again afterwards.
 */

jest.mock('../../src/modules/users/users.repository');

const jwt = require('jsonwebtoken');
const usersRepository = require('../../src/modules/users/users.repository');
const { env } = require('../../src/config/env');
const auth = require('../../src/middleware/auth');

const token = jwt.sign({ id: 5, orgId: 3 }, env.auth.secret);
const request = () => ({ headers: { authorization: `Bearer ${token}` } });

const run = async (middleware, req) => new Promise((resolve, reject) => {
  middleware(req, {}, (err) => (err ? reject(err) : resolve()));
});

beforeEach(() => {
  auth.configureAuthCache({ enabled: true });
  usersRepository.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 3, type: 9 });
  usersRepository.isAdmin.mockResolvedValue(true);
});
afterAll(() => auth.configureAuthCache({ enabled: false }));

it('looks the token holder up once for repeated requests', async () => {
  await run(auth.verifyToken, request());
  await run(auth.verifyToken, request());
  expect(usersRepository.findActiveById).toHaveBeenCalledTimes(1);
});

it('checks admin standing once for repeated requests', async () => {
  const req = request();
  await run(auth.verifyToken, req);
  await run(auth.requireAdmin, req);
  await run(auth.requireAdmin, req);
  expect(usersRepository.isAdmin).toHaveBeenCalledTimes(1);
});

it('consults the database again once the cache is reset', async () => {
  await run(auth.verifyToken, request());
  auth.resetAuthCache();
  await run(auth.verifyToken, request());
  expect(usersRepository.findActiveById).toHaveBeenCalledTimes(2);
});

it('does not cache a rejection', async () => {
  usersRepository.findActiveById.mockResolvedValueOnce(null);
  await expect(run(auth.verifyToken, request())).rejects.toMatchObject({ statusCode: 401 });
  await run(auth.verifyToken, request());
  expect(usersRepository.findActiveById).toHaveBeenCalledTimes(2);
});
